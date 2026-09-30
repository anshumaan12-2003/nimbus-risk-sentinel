"""
Breachpath Cloud Recon — Infrastructure Drift Detection Engine
Compares infrastructure security snapshots across scans to isolate state mutations:
- New Vulnerabilities
- Resolved Vulnerabilities
- Regressed Vulnerabilities (previously fixed issues that reappeared)
- Net Risk Score Delta
"""

from typing import List, Dict, Any, Tuple
from datetime import datetime


class DriftReport:
    def __init__(
        self,
        current_scan_id: str,
        previous_scan_id: str,
        new_findings: List[Dict[str, Any]],
        resolved_findings: List[Dict[str, Any]],
        regressed_findings: List[Dict[str, Any]],
        persisting_findings: List[Dict[str, Any]],
        current_risk_score: int,
        previous_risk_score: int,
    ):
        self.current_scan_id = current_scan_id
        self.previous_scan_id = previous_scan_id
        self.new_findings = new_findings
        self.resolved_findings = resolved_findings
        self.regressed_findings = regressed_findings
        self.persisting_findings = persisting_findings
        self.current_risk_score = current_risk_score
        self.previous_risk_score = previous_risk_score
        self.risk_score_delta = current_risk_score - previous_risk_score
        self.total_drift_events = len(new_findings) + len(resolved_findings) + len(regressed_findings)
        self.status = "DEGRADED" if self.risk_score_delta > 0 else "IMPROVED" if self.risk_score_delta < 0 else "STABLE"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "current_scan_id": str(self.current_scan_id),
            "previous_scan_id": str(self.previous_scan_id),
            "status": self.status,
            "risk_score_delta": self.risk_score_delta,
            "current_risk_score": self.current_risk_score,
            "previous_risk_score": self.previous_risk_score,
            "summary": {
                "new_count": len(self.new_findings),
                "resolved_count": len(self.resolved_findings),
                "regressed_count": len(self.regressed_findings),
                "persisting_count": len(self.persisting_findings),
                "total_drift_events": self.total_drift_events,
            },
            "new_findings": self.new_findings,
            "resolved_findings": self.resolved_findings,
            "regressed_findings": self.regressed_findings,
            "detected_at": datetime.utcnow().isoformat(),
        }


class DriftDetector:
    """
    Calculates finding diffs using deterministic fingerprinting.
    Fingerprint format: {rule_id}::{service}::{resource_id}
    """

    @staticmethod
    def _fingerprint(finding: Any) -> str:
        if isinstance(finding, dict):
            rule = finding.get("rule_id", "")
            svc = finding.get("service", "")
            res = finding.get("resource_id") or finding.get("resource_name") or ""
        else:
            rule = getattr(finding, "rule_id", "")
            svc = getattr(finding, "service", "")
            # ORM rows: use the stable AWS id, not the per-scan resources.id UUID
            # (the UUID changes every scan, which made every finding look "new").
            resource = getattr(finding, "resource", None)
            res = (getattr(resource, "resource_id", None) if resource is not None else None) \
                or getattr(finding, "resource_name", None) or getattr(finding, "resource_id", "")
        return f"{rule}::{svc}::{res}"

    @classmethod
    def calculate_drift(
        cls,
        current_scan_id: str,
        previous_scan_id: str,
        current_findings: List[Any],
        previous_findings: List[Any],
        resolved_history_fingerprints: List[str] = None,
        current_risk_score: int = 0,
        previous_risk_score: int = 0,
    ) -> DriftReport:
        resolved_history = set(resolved_history_fingerprints or [])

        # Build fingerprint lookup maps
        curr_map = {cls._fingerprint(f): f for f in current_findings}
        prev_map = {cls._fingerprint(f): f for f in previous_findings}

        curr_keys = set(curr_map.keys())
        prev_keys = set(prev_map.keys())

        # Discovered keys (in current but not in previous)
        added_keys = curr_keys - prev_keys
        # Gone keys (in previous but not in current)
        removed_keys = prev_keys - curr_keys
        # Shared keys (in both)
        persisting_keys = curr_keys & prev_keys

        new_findings = []
        regressed_findings = []

        for key in added_keys:
            finding = curr_map[key]
            finding_dict = finding if isinstance(finding, dict) else {
                "rule_id": finding.rule_id,
                "title": finding.title,
                "severity": getattr(finding.severity, "value", str(finding.severity)),
                "service": finding.service,
                "resource_name": finding.resource_name,
                "risk_score": finding.risk_score,
            }
            if key in resolved_history:
                regressed_findings.append(finding_dict)
            else:
                new_findings.append(finding_dict)

        resolved_findings = []
        for key in removed_keys:
            finding = prev_map[key]
            finding_dict = finding if isinstance(finding, dict) else {
                "rule_id": finding.rule_id,
                "title": finding.title,
                "severity": getattr(finding.severity, "value", str(finding.severity)),
                "service": finding.service,
                "resource_name": finding.resource_name,
                "risk_score": finding.risk_score,
            }
            resolved_findings.append(finding_dict)

        persisting_findings = [
            curr_map[k] if isinstance(curr_map[k], dict) else {
                "rule_id": curr_map[k].rule_id,
                "title": curr_map[k].title,
                "severity": getattr(curr_map[k].severity, "value", str(curr_map[k].severity)),
                "service": curr_map[k].service,
            }
            for k in persisting_keys
        ]

        return DriftReport(
            current_scan_id=current_scan_id,
            previous_scan_id=previous_scan_id,
            new_findings=new_findings,
            resolved_findings=resolved_findings,
            regressed_findings=regressed_findings,
            persisting_findings=persisting_findings,
            current_risk_score=current_risk_score,
            previous_risk_score=previous_risk_score,
        )
