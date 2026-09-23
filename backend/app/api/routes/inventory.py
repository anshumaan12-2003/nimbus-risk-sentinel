"""
Asset inventory from the latest scan's snapshot, flattened into one list the UI can
search/filter, with exposure flags and open-finding counts per asset.
"""
from collections import Counter
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.api.deps import latest_completed_scan
from app.database import get_db
from app.intelligence.graph_builder import _is_crown
from app.models.finding import Finding, FindingStatus
from app.models.inventory import InventorySnapshot

router = APIRouter(prefix="/inventory", tags=["Inventory"])


def _flatten(inv: dict) -> list[dict]:
    sgs = inv.get("security_groups", {})
    out = []
    for i in inv.get("ec2", []):
        open_ports = sorted({p for sg in i["sg_ids"] for p in sgs.get(sg, {}).get("open_ports", [])})
        out.append({"id": i["id"], "type": "ec2", "name": i["name"], "region": i["region"],
                    "public": bool(i.get("public_ip") and open_ports), "crown": False,
                    "details": {"state": i.get("state"), "public_ip": i.get("public_ip"), "open_ports": open_ports,
                                "imds_v1": i.get("imds_v1"), "instance_profile": i.get("instance_profile_arn")},
                    "tags": i.get("tags", {})})
    for b in inv.get("s3", []):
        out.append({"id": b["arn"], "type": "s3", "name": b["name"], "region": "global", "public": b["public_policy"],
                    "crown": (not b["public_policy"]) and _is_crown(b["name"], b.get("tags", {})),
                    "details": {"public_policy": b["public_policy"]}, "tags": b.get("tags", {})})
    for d in inv.get("rds", []):
        out.append({"id": d["arn"], "type": "rds", "name": d["id"], "region": d["region"], "public": d["public"],
                    "crown": True, "details": {"engine": d.get("engine"), "publicly_accessible": d["public"]},
                    "tags": d.get("tags", {})})
    for f in inv.get("lambda", []):
        out.append({"id": f["arn"], "type": "lambda", "name": f["name"], "region": f["region"],
                    "public": f.get("public_url", False), "crown": False,
                    "details": {"role": f.get("role_arn"), "public_url": f.get("public_url")}, "tags": {}})
    for t in inv.get("dynamodb", []):
        out.append({"id": t["arn"], "type": "dynamodb", "name": t["name"], "region": t["region"], "public": False,
                    "crown": True, "details": {}, "tags": {}})
    for s in inv.get("secrets", []):
        out.append({"id": s["arn"], "type": "secret", "name": s["name"], "region": s["region"], "public": False,
                    "crown": False, "details": {}, "tags": {k: v for k, v in s.get("tags", {}).items() if not k.startswith("aws:")}})
    for r in inv.get("iam", {}).get("roles", []):
        out.append({"id": r["arn"], "type": "iam_role", "name": r["name"], "region": "global", "public": False,
                    "crown": False, "details": {"policy_statements": len(r["statements"]),
                                                "instance_profiles": len(r["instance_profiles"])}, "tags": r.get("tags", {})})
    for u in inv.get("iam", {}).get("users", []):
        out.append({"id": u["arn"], "type": "iam_user", "name": u["name"], "region": "global", "public": False,
                    "crown": False, "details": {"policy_statements": len(u["statements"])}, "tags": {}})
    return out


@router.get("")
def list_assets(type: Optional[str] = None, q: Optional[str] = None, exposed: bool = False,
                limit: int = Query(500, le=2000), db: Session = Depends(get_db)):
    scan = latest_completed_scan(db)
    snap = scan and db.query(InventorySnapshot).filter(InventorySnapshot.scan_id == scan.id).first()
    if not snap:
        return {"scan_id": None, "collected_at": None, "summary": {}, "assets": []}

    open_findings = (db.query(Finding).options(joinedload(Finding.resource))
                     .filter(Finding.scan_id == scan.id,
                             Finding.status.in_([FindingStatus.OPEN, FindingStatus.IN_PROGRESS])).all())
    by_res: dict[str, list] = {}
    for f in open_findings:
        by_res.setdefault(f.resource.resource_id, []).append(
            {"id": str(f.id), "rule_id": f.rule_id, "severity": f.severity.value, "title": f.title})

    assets = _flatten(snap.data)
    for a in assets:
        # EC2 findings are often on the security group, so attach SG findings to instances using it
        linked = list(by_res.get(a["id"], []))
        a["findings"] = linked
        a["max_severity"] = next((s for s in ("CRITICAL", "HIGH", "MEDIUM", "LOW") if any(x["severity"] == s for x in linked)), None)

    summary = {"total": len(assets), "by_type": dict(Counter(a["type"] for a in assets)),
               "public": sum(a["public"] for a in assets), "crown_jewels": sum(a["crown"] for a in assets),
               "with_findings": sum(1 for a in assets if a["findings"])}
    if type:
        assets = [a for a in assets if a["type"] == type]
    if exposed:
        assets = [a for a in assets if a["public"]]
    if q:
        ql = q.lower()
        assets = [a for a in assets if ql in a["name"].lower() or ql in a["id"].lower()]
    return {"scan_id": str(scan.id), "collected_at": snap.data.get("collected_at"), "account_id": snap.data.get("account_id"),
            "regions": snap.data.get("regions"), "summary": summary, "assets": assets[:limit]}
