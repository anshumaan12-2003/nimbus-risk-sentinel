"""
Scan pipeline.

    preflight identity -> rule scanners (global once, regional in parallel) -> dedupe
    -> carry finding status forward -> inventory snapshot -> persist -> events/alerts

Runs in-process (FastAPI BackgroundTasks) or in a Celery worker (SCAN_EXECUTOR=celery).
"""
import logging
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.integrations.slack import send_slack_alert
from app.intelligence.risk_scorer import compute_finding_risk_score, compute_risk_score
from app.models.finding import Finding, FindingStatus
from app.models.inventory import InventorySnapshot
from app.models.resource import Resource
from app.models.scan import Scan, ScanStatus
from app.scanner.aws.ec2_scanner import EC2Scanner
from app.scanner.aws.iam_scanner import IAMScanner
from app.scanner.aws.rds_scanner import RDSScanner
from app.scanner.aws.s3_scanner import S3Scanner
from app.scanner.base_scanner import ScanFinding
from app.scanner.inventory import InventoryCollector
from app.utils.aws_client import get_aws_account_id
from app.utils.events import bus
from app.tasks.progress import ScanProgress

logger = logging.getLogger(__name__)
STALE_AFTER = timedelta(minutes=30)


def _sev(x) -> str:
    return (x.value if hasattr(x, "value") else str(x)).upper()


def _previous_completed(db: Session, exclude_id) -> Scan | None:
    return (db.query(Scan).filter(Scan.status == ScanStatus.COMPLETED, Scan.id != exclude_id)
            .order_by(Scan.started_at.desc()).first())


def _fingerprints(db: Session, scan: Scan | None) -> dict[tuple[str, str], Finding]:
    if not scan:
        return {}
    rows = (db.query(Finding, Resource.resource_id).join(Resource, Finding.resource_id == Resource.id)
            .filter(Finding.scan_id == scan.id).all())
    return {(f.rule_id, rid): f for f, rid in rows}


def claim_scan(db: Session, triggered_by: str, regions=None) -> Scan | None:
    """Create a scan row unless one is already running (returns None in that case)."""
    now = datetime.utcnow()
    # expire zombies (e.g. server restarted mid-scan) so they don't block forever
    for z in db.query(Scan).filter(Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING])).all():
        if z.started_at and now - z.started_at > STALE_AFTER:
            z.status, z.error_message = ScanStatus.FAILED, "Timed out / worker restarted"
    db.commit()
    if db.query(Scan).filter(Scan.status.in_([ScanStatus.PENDING, ScanStatus.RUNNING])).first():
        return None
    scan = Scan(status=ScanStatus.PENDING, triggered_by=triggered_by,
                region=",".join(regions or settings.aws_regions_list), started_at=now)
    db.add(scan)
    db.commit()
    db.refresh(scan)
    return scan


def run_full_scan(scan_id: str = None, regions: list = None, triggered_by: str = "manual"):
    db: Session = SessionLocal()
    scan = None
    progress = None
    try:
        if scan_id:
            scan = db.query(Scan).filter(Scan.id == uuid.UUID(str(scan_id))).first()
        if scan is None:
            scan = claim_scan(db, triggered_by, regions)
            if scan is None:
                logger.info("Scan already in progress; skipping scheduled run")
                return {"skipped": True}
        scan_id = str(scan.id)

        account_id = get_aws_account_id()
        if not account_id:
            raise RuntimeError("AWS credentials invalid or missing (sts:GetCallerIdentity failed). "
                               "Check AWS_PROFILE / keys / role in .env and call GET /api/v1/account/preflight.")
        scan.account_id = account_id
        scan.status = ScanStatus.RUNNING
        scan.started_at = datetime.utcnow()
        db.commit()

        target_regions = regions or settings.aws_regions_list
        bus.publish("scan.started", "Scan started", f"Account {account_id} · {len(target_regions)} region(s)",
                    link="/scans", scan_id=scan_id)

        # ── 1+2. Rule checks and inventory run in ONE pool, each unit is a progress cell ──
        #   checks:    IAM + S3 are global (run once), EC2 + RDS per region
        #   inventory: every service the attack graph needs, per region
        collector = InventoryCollector(target_regions, settings.AWS_DEFAULT_REGION)
        progress = ScanProgress(scan_id, account_id)
        check_jobs = [(IAMScanner, "iam", "global"), (S3Scanner, "s3", "global")]
        check_jobs += [(cls, svc, r) for r in target_regions for cls, svc in ((EC2Scanner, "ec2"), (RDSScanner, "rds"))]
        units = collector.units()
        progress.add_many(("checks", svc, r) for _, svc, r in check_jobs)
        progress.add_many(("inventory", svc, r) for svc, r, _ in units)
        progress.add("analysis", "graph", "global")
        progress.set_stage("discovering")

        warnings: list[dict] = []
        raw: list[ScanFinding] = []
        parts: list[dict] = []

        def run_check(cls, svc, region):
            k = progress.key("checks", svc, region)
            progress.start(k)
            try:
                found = cls(region=settings.AWS_DEFAULT_REGION if region == "global" else region).scan()
            except Exception as e:
                progress.fail(k, str(e))
                raise
            progress.finish(k, findings=len(found))
            return found

        def run_unit(svc, region, fn):
            k = progress.key("inventory", svc, region)
            progress.start(k)
            try:
                part = fn()
            except Exception as e:  # collector wraps AWS errors; this is a bug guard
                progress.fail(k, str(e))
                raise
            denied = sum(1 for w in list(collector.warnings) if w["service"] == svc and w["region"] == region)
            progress.finish(k, warnings=denied)
            return part

        with ThreadPoolExecutor(max_workers=min(12, len(check_jobs) + len(units))) as pool:
            futs = {pool.submit(run_check, cls, svc, r): ("check", cls.__name__, r) for cls, svc, r in check_jobs}
            futs.update({pool.submit(run_unit, svc, r, fn): ("unit", svc, r) for svc, r, fn in units})
            for fut in as_completed(futs):
                kind, name, region = futs[fut]
                try:
                    result = fut.result()
                except Exception as e:
                    warnings.append({"service": name, "region": region, "call": "scan", "error": str(e)[:300]})
                    logger.error("%s[%s] failed: %s", name, region, e)
                    continue
                if kind == "check":
                    raw.extend(result)
                    logger.info("%s[%s]: %d findings", name, region, len(result))
                else:
                    parts.append(result)
        progress.flush_pending()

        # dedupe on (rule, resource)
        unique: dict[tuple[str, str], ScanFinding] = {}
        for f in raw:
            unique.setdefault((f.rule_id, f.resource_id), f)

        progress.set_stage("analyzing")
        graph_key = progress.key("analysis", "graph", "global")
        progress.start(graph_key)
        inventory = collector.assemble(account_id, parts)
        warnings.extend(collector.warnings)

        # ── 4. Persist, carrying workflow state forward ──
        prev_scan = _previous_completed(db, scan.id)
        prev = _fingerprints(db, prev_scan)
        counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        db_findings, new_findings = [], []

        for key, rf in unique.items():
            resource = Resource(scan_id=scan.id, resource_id=rf.resource_id, resource_arn=rf.resource_id
                                if rf.resource_id.startswith("arn:") else None, resource_type=rf.resource_type,
                                name=rf.resource_name, region=rf.region, account_id=account_id,
                                tags=rf.tags, metadata_=rf.metadata)
            db.add(resource)
            db.flush()
            finding = Finding(scan_id=scan.id, resource_id=resource.id, rule_id=rf.rule_id, title=rf.title,
                              description=rf.description, recommendation=rf.recommendation,
                              remediation_cmd=rf.remediation_cmd, severity=rf.severity,
                              risk_score=compute_finding_risk_score(severity=rf.severity, resource_name=rf.resource_name),
                              service=rf.service, region=rf.region, resource_name=rf.resource_name)
            old = prev.get(key)
            if old is not None:
                finding.detected_at = old.detected_at            # first-seen date survives rescans
                finding.assigned_to = old.assigned_to
                if old.status in (FindingStatus.ACCEPTED, FindingStatus.IN_PROGRESS):
                    finding.status = old.status                  # RESOLVED that reappears = regression -> OPEN
            else:
                new_findings.append((rf, finding))
            db.add(finding)
            db_findings.append(finding)
            counts[_sev(rf.severity)] = counts.get(_sev(rf.severity), 0) + 1

        db.add(InventorySnapshot(scan_id=scan.id, data=inventory, warnings=warnings))
        db.flush()

        overall = compute_risk_score(db_findings)
        scan.status = ScanStatus.COMPLETED
        scan.completed_at = datetime.utcnow()
        scan.total_findings = str(len(db_findings))
        scan.critical_count, scan.high_count = str(counts["CRITICAL"]), str(counts["HIGH"])
        scan.medium_count, scan.low_count = str(counts["MEDIUM"]), str(counts["LOW"])
        scan.risk_score = str(overall)
        scan.error_message = (f"{len(warnings)} permission/API warnings — see /api/v1/scans/{scan_id}/warnings"
                              if warnings else None)
        db.commit()
        progress.finish(graph_key)
        progress.set_stage("completed")

        # ── 5. Events + alerts only for what CHANGED (no Slack spam every 15 min) ──
        fixed = [k for k in prev if k not in unique]
        for rf, f in new_findings[:10]:
            if prev_scan is not None:
                bus.publish("finding.new", f"New finding: {rf.title}", f"{rf.rule_id} · {rf.resource_name}",
                            severity=_sev(rf.severity), link="/findings")
            if _sev(rf.severity) == "CRITICAL":
                try:
                    send_slack_alert(asdict(rf))
                except Exception as e:
                    logger.error("Slack alert failed: %s", e)
        for rule_id, rid in fixed[:10]:
            bus.publish("finding.resolved", f"{rule_id} no longer detected", rid, link="/drift")
        bus.publish("scan.completed", "Scan completed",
                    f"{len(db_findings)} findings · {sum(inventory['counts'].values())} assets · risk {overall}"
                    + (f" · {len(warnings)} warnings" if warnings else ""), link="/scans", scan_id=scan_id)

        logger.info("[Scan %s] done: %d findings, risk %s", scan_id, len(db_findings), overall)
        return {"scan_id": scan_id, "total_findings": len(db_findings), "risk_score": overall, **counts}

    except Exception as e:
        logger.error("[Scan %s] fatal: %s", scan_id, e, exc_info=True)
        db.rollback()
        if scan is not None:
            scan.status, scan.error_message = ScanStatus.FAILED, str(e)[:1000]
            scan.completed_at = datetime.utcnow()
            db.commit()
        if progress is not None:
            try:
                progress.set_stage("failed")
            except Exception:  # pragma: no cover
                pass
        bus.publish("scan.failed", "Scan failed", str(e)[:200], severity="HIGH", link="/scans", scan_id=scan_id)
        return {"scan_id": scan_id, "error": str(e)}
    finally:
        db.close()


# ── Celery registration (only when Celery is installed/configured) ──────────
try:
    from app.tasks.celery_app import celery_app

    @celery_app.task(name="app.tasks.scan_tasks.run_full_scan_task", acks_late=True)
    def run_full_scan_task(scan_id: str = None, regions: list = None, triggered_by: str = "scheduler"):
        return run_full_scan(scan_id=scan_id, regions=regions, triggered_by=triggered_by)
except Exception:  # pragma: no cover
    run_full_scan_task = None
