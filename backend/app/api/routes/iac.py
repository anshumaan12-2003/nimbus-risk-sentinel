"""
Nimbus Risk Sentinel — IaC Security Scan API Routes
Handles Terraform static analysis scan requests from CLI, CI/CD pipelines, and the UI.
"""

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from app.auth.deps import admin, engineer
from pydantic import BaseModel
from typing import Optional
import os
import tempfile
import shutil

from app.scanner.iac.terraform_scanner import TerraformScanner

router = APIRouter(prefix="/iac", tags=["IaC Security Scanning"])

scanner = TerraformScanner()


# ─── Request Models ──────────────────────────────────────────────────────────
class HCLScanRequest(BaseModel):
    hcl_content: str
    filename: Optional[str] = "pr-diff.tf"
    pr_number: Optional[int] = None
    repository: Optional[str] = None


class DirectoryScanRequest(BaseModel):
    directory: str  # Absolute path to scan (for local dev / CI runners)


# ─── Endpoints ───────────────────────────────────────────────────────────────
@router.post("/scan/content", dependencies=[Depends(engineer)])
def scan_hcl_content(req: HCLScanRequest):
    """
    Scan raw Terraform HCL content for security misconfigurations.
    Used by GitHub Actions to scan PR diffs without checking out full repo.
    """
    if not req.hcl_content.strip():
        raise HTTPException(status_code=400, detail="hcl_content cannot be empty.")
    
    result = scanner.scan_content(req.hcl_content, filename=req.filename)
    result["pr_number"] = req.pr_number
    result["repository"] = req.repository
    return result


# reads arbitrary paths on the API host -> admin only
@router.post("/scan/directory", dependencies=[Depends(admin)])
def scan_directory(req: DirectoryScanRequest):
    """
    Scan all .tf files in a given directory.
    Used by CI runners or local developer invocations.
    """
    if not os.path.isdir(req.directory):
        raise HTTPException(status_code=404, detail=f"Directory not found: {req.directory}")
    
    return scanner.scan_directory(req.directory)


@router.post("/scan/upload", dependencies=[Depends(engineer)])
async def scan_uploaded_tf(file: UploadFile = File(...)):
    """
    Scan an uploaded .tf file or zip archive.
    Useful for UI-based scanning without a CI pipeline.
    """
    if not (file.filename.endswith(".tf") or file.filename.endswith(".zip")):
        raise HTTPException(status_code=400, detail="Only .tf or .zip files are accepted.")

    # Write to temp dir
    tmp_dir = tempfile.mkdtemp(prefix="nimbus_iac_")
    try:
        tmp_path = os.path.join(tmp_dir, file.filename)
        with open(tmp_path, "wb") as f:
            content = await file.read()
            f.write(content)

        if file.filename.endswith(".zip"):
            shutil.unpack_archive(tmp_path, tmp_dir)
            os.remove(tmp_path)

        return scanner.scan_directory(tmp_dir)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


@router.get("/scan/demo")
def demo_iac_scan():
    """
    Run a demo scan against the bundled Terraform infrastructure modules.
    Returns pre-populated findings for dashboard demonstration without requiring a real repo.
    """
    # Resolve path relative to project root
    infra_path = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "infrastructure", "terraform")
    )

    if os.path.isdir(infra_path):
        return scanner.scan_directory(infra_path)

    # Fallback: return mock demo data if infra dir not available
    return {
        "total_findings": 9,
        "severity_summary": {"CRITICAL": 4, "HIGH": 2, "MEDIUM": 2, "LOW": 1},
        "max_risk_score": 99,
        "passed": False,
        "resources_scanned": 8,
        "findings": [
            {
                "rule_id": "TF-IAM-001",
                "title": "IAM Policy Grants Wildcard (*) Actions — Full Admin Access",
                "description": "Resource `scanner_inline` contains `Action: '*'` which grants unrestricted administrative access.",
                "severity": "CRITICAL",
                "service": "iam",
                "resource_type": "aws_iam_role_policy",
                "resource_name": "scanner_inline",
                "file_path": "modules/iam/main.tf",
                "line_number": 29,
                "remediation_hcl": '  "Action": [\n    "s3:GetObject",\n    "s3:ListBucket"\n  ]',
                "compliance": ["CIS AWS 1.16", "PCI DSS 7.1.2", "SOC2 CC6.3"],
                "risk_score": 99,
            },
            {
                "rule_id": "TF-EC2-001",
                "title": "Security Group Allows Unrestricted SSH Access (Port 22)",
                "description": "Resource `worker_sg` permits SSH (port 22) from `0.0.0.0/0`.",
                "severity": "CRITICAL",
                "service": "ec2",
                "resource_type": "aws_security_group",
                "resource_name": "worker_sg",
                "file_path": "modules/ec2/main.tf",
                "line_number": 23,
                "remediation_hcl": '  cidr_blocks = ["10.0.0.0/8"]  # Restrict to VPN/internal CIDR',
                "compliance": ["CIS AWS 5.2", "PCI DSS 1.2.1"],
                "risk_score": 98,
            },
            {
                "rule_id": "TF-RDS-001",
                "title": "RDS Instance Is Publicly Accessible",
                "description": "Resource `this` has `publicly_accessible = true`, exposing the DB to the internet.",
                "severity": "CRITICAL",
                "service": "rds",
                "resource_type": "aws_db_instance",
                "resource_name": "this",
                "file_path": "modules/rds/main.tf",
                "line_number": 44,
                "remediation_hcl": '  publicly_accessible = false',
                "compliance": ["CIS AWS 2.3.2", "PCI DSS 1.3.2"],
                "risk_score": 97,
            },
        ],
    }
