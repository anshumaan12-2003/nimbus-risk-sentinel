"""
Breachpath Cloud Recon — Terraform IaC Static Security Scanner
Parses Terraform HCL files for security misconfigurations without executing them.
Detects critical, high, medium, and low severity findings per CIS AWS Benchmark rules.
"""

import re
import os
import json
import logging
from dataclasses import dataclass, field, asdict
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path

logger = logging.getLogger("nimbus.iac_scanner")


# ─── Finding Dataclass ────────────────────────────────────────────────────────
@dataclass
class IaCFinding:
    rule_id: str
    title: str
    description: str
    severity: str              # CRITICAL | HIGH | MEDIUM | LOW
    service: str
    resource_type: str
    resource_name: str
    file_path: str
    line_number: int
    remediation_hcl: str
    compliance: List[str] = field(default_factory=list)
    risk_score: int = 50

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# ─── Regex-Based HCL Parser ──────────────────────────────────────────────────
class TerraformHCLParser:
    """
    Lightweight regex-based HCL parser. Extracts resource blocks
    and their attribute key-value pairs for security rule evaluation.
    No HCL2 Python library required.
    """

    RESOURCE_BLOCK_RE = re.compile(
        r'resource\s+"(?P<type>[^"]+)"\s+"(?P<name>[^"]+)"\s*\{',
        re.MULTILINE
    )
    ATTR_RE = re.compile(
        r'^\s*(?P<key>[\w_]+)\s*=\s*(?P<value>.+)$',
        re.MULTILINE
    )

    def parse_directory(self, directory: str) -> List[Dict[str, Any]]:
        """Recursively parse all .tf files in a directory."""
        resources = []
        tf_files = Path(directory).rglob("*.tf")
        for tf_file in tf_files:
            try:
                resources.extend(self.parse_file(str(tf_file)))
            except Exception as e:
                logger.warning(f"Failed to parse {tf_file}: {e}")
        return resources

    def parse_file(self, file_path: str) -> List[Dict[str, Any]]:
        """Parse a single .tf file and extract all resource blocks."""
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return self._extract_resources(content, file_path)

    def _extract_resources(self, content: str, file_path: str) -> List[Dict[str, Any]]:
        """Extract resource blocks and their flattened attributes."""
        resources = []
        lines = content.split("\n")

        for match in self.RESOURCE_BLOCK_RE.finditer(content):
            resource_type = match.group("type")
            resource_name = match.group("name")
            start_pos = match.end()
            line_number = content[:match.start()].count("\n") + 1

            # Extract the block body (simple brace-matching)
            block_body, end_pos = self._extract_block(content, start_pos)
            attrs = self._parse_attributes(block_body)

            resources.append({
                "type": resource_type,
                "name": resource_name,
                "file_path": file_path,
                "line_number": line_number,
                "attributes": attrs,
                "raw_block": block_body,
            })

        return resources

    def _extract_block(self, content: str, start: int) -> Tuple[str, int]:
        """Extract content between matching braces."""
        depth = 1
        i = start
        while i < len(content) and depth > 0:
            if content[i] == "{":
                depth += 1
            elif content[i] == "}":
                depth -= 1
            i += 1
        return content[start:i - 1], i

    def _parse_attributes(self, block: str) -> Dict[str, Any]:
        """Parse flat key = value attributes from a block."""
        attrs = {}
        for match in self.ATTR_RE.finditer(block):
            key = match.group("key")
            raw_val = match.group("value").strip().rstrip(",").strip('"').strip("'")
            # Normalize booleans
            if raw_val.lower() == "true":
                attrs[key] = True
            elif raw_val.lower() == "false":
                attrs[key] = False
            else:
                attrs[key] = raw_val
        return attrs


# ─── Security Rules Engine ───────────────────────────────────────────────────
class TerraformSecurityRules:
    """
    Applies CIS AWS Benchmark and AWS Security Best Practice rules
    against parsed Terraform resource blocks.
    """

    def check(self, resource: Dict[str, Any]) -> List[IaCFinding]:
        findings = []
        rtype = resource["type"]
        rname = resource["name"]
        attrs = resource["attributes"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        # Dispatch to per-service checks
        if rtype == "aws_s3_bucket":
            pass  # S3 checks are via companion resources below

        if rtype == "aws_s3_bucket_public_access_block":
            findings.extend(self._check_s3_public_access(resource))

        if rtype == "aws_s3_bucket_server_side_encryption_configuration":
            pass  # Presence means encryption is on

        if rtype == "aws_s3_bucket_versioning":
            pass  # Presence means versioning is configured

        if rtype in ("aws_security_group", "aws_security_group_rule"):
            findings.extend(self._check_security_group(resource))

        if rtype == "aws_instance":
            findings.extend(self._check_ec2_instance(resource))

        if rtype == "aws_db_instance":
            findings.extend(self._check_rds(resource))

        if rtype in ("aws_iam_role_policy", "aws_iam_policy", "aws_iam_user_policy"):
            findings.extend(self._check_iam_policy(resource))

        if rtype == "aws_iam_user":
            findings.extend(self._check_iam_user(resource))

        return findings

    # ─── S3 Checks ──────────────────────────────────────────────────────────
    def _check_s3_public_access(self, resource: Dict) -> List[IaCFinding]:
        findings = []
        attrs = resource["attributes"]
        rname = resource["name"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        dangerous_flags = {
            "block_public_acls": ("TF-S3-001", "S3 block_public_acls Not Enabled"),
            "ignore_public_acls": ("TF-S3-002", "S3 ignore_public_acls Not Enabled"),
            "block_public_policy": ("TF-S3-003", "S3 block_public_policy Not Enabled"),
            "restrict_public_buckets": ("TF-S3-004", "S3 restrict_public_buckets Not Enabled"),
        }

        for flag, (rule_id, title) in dangerous_flags.items():
            if attrs.get(flag) is False:
                findings.append(IaCFinding(
                    rule_id=rule_id,
                    title=title,
                    description=(
                        f"The `{flag}` attribute in resource `{rname}` is set to `false`. "
                        "This allows public access to the S3 bucket, risking data exposure to the internet."
                    ),
                    severity="CRITICAL",
                    service="s3",
                    resource_type="aws_s3_bucket_public_access_block",
                    resource_name=rname,
                    file_path=fpath,
                    line_number=line,
                    remediation_hcl=f'  {flag} = true  # Fix: Enable to block public access',
                    compliance=["CIS AWS 2.1.2", "PCI DSS 1.3", "SOC2 CC6.6"],
                    risk_score=95,
                ))
        return findings

    # ─── Security Group Checks ───────────────────────────────────────────────
    def _check_security_group(self, resource: Dict) -> List[IaCFinding]:
        findings = []
        raw = resource["raw_block"]
        rname = resource["name"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        # Detect unrestricted ingress on dangerous ports
        ingress_blocks = re.findall(r'ingress\s*\{([^}]*)\}', raw, re.DOTALL)
        for ingress in ingress_blocks:
            from_port_m = re.search(r'from_port\s*=\s*(\d+)', ingress)
            to_port_m = re.search(r'to_port\s*=\s*(\d+)', ingress)
            cidr_m = re.search(r'cidr_blocks\s*=\s*\["?([^"\]]+)"?\]', ingress)

            from_port = int(from_port_m.group(1)) if from_port_m else None
            to_port = int(to_port_m.group(1)) if to_port_m else None
            cidr = cidr_m.group(1).strip() if cidr_m else ""

            if cidr in ("0.0.0.0/0", "::/0"):
                if from_port in (22,) or to_port in (22,):
                    findings.append(IaCFinding(
                        rule_id="TF-EC2-001",
                        title="Security Group Allows Unrestricted SSH Access (Port 22)",
                        description=(
                            f"Resource `{rname}` permits SSH (port 22) from `{cidr}`. "
                            "This exposes instances to brute-force and unauthorized access from the entire internet."
                        ),
                        severity="CRITICAL",
                        service="ec2",
                        resource_type="aws_security_group",
                        resource_name=rname,
                        file_path=fpath,
                        line_number=line,
                        remediation_hcl=(
                            '  ingress {\n'
                            '    from_port   = 22\n'
                            '    to_port     = 22\n'
                            '    protocol    = "tcp"\n'
                            '    cidr_blocks = ["10.0.0.0/8"]  # Fix: Restrict to VPN/internal CIDR\n'
                            '  }'
                        ),
                        compliance=["CIS AWS 5.2", "PCI DSS 1.2.1", "NIST SP 800-53 AC-17"],
                        risk_score=98,
                    ))
                if from_port in (3389,) or to_port in (3389,):
                    findings.append(IaCFinding(
                        rule_id="TF-EC2-002",
                        title="Security Group Allows Unrestricted RDP Access (Port 3389)",
                        description=(
                            f"Resource `{rname}` permits RDP (port 3389) from `{cidr}`. "
                            "Exposed RDP is the most common ransomware entry vector."
                        ),
                        severity="CRITICAL",
                        service="ec2",
                        resource_type="aws_security_group",
                        resource_name=rname,
                        file_path=fpath,
                        line_number=line,
                        remediation_hcl=(
                            '  # Fix: Remove RDP ingress or restrict to private CIDR\n'
                            '  # cidr_blocks = ["10.0.0.0/8"]'
                        ),
                        compliance=["CIS AWS 5.3", "PCI DSS 1.2.1"],
                        risk_score=98,
                    ))
        return findings

    # ─── EC2 Checks ──────────────────────────────────────────────────────────
    def _check_ec2_instance(self, resource: Dict) -> List[IaCFinding]:
        findings = []
        attrs = resource["attributes"]
        raw = resource["raw_block"]
        rname = resource["name"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        # Check EBS encryption
        ebs_encrypted = None
        ebs_match = re.search(r'root_block_device\s*\{([^}]*)\}', raw, re.DOTALL)
        if ebs_match:
            ebs_block = ebs_match.group(1)
            enc_m = re.search(r'encrypted\s*=\s*(true|false)', ebs_block)
            if enc_m:
                ebs_encrypted = enc_m.group(1) == "true"

        if ebs_encrypted is False:
            findings.append(IaCFinding(
                rule_id="TF-EC2-003",
                title="EC2 Root EBS Volume Not Encrypted",
                description=(
                    f"Resource `{rname}` has `encrypted = false` on the root block device. "
                    "Unencrypted volumes expose data at rest if physical media is compromised."
                ),
                severity="HIGH",
                service="ec2",
                resource_type="aws_instance",
                resource_name=rname,
                file_path=fpath,
                line_number=line,
                remediation_hcl=(
                    '  root_block_device {\n'
                    '    encrypted = true  # Fix: Enable EBS encryption\n'
                    '  }'
                ),
                compliance=["CIS AWS 2.2.1", "PCI DSS 3.4", "SOC2 CC6.7"],
                risk_score=72,
            ))

        return findings

    # ─── RDS Checks ──────────────────────────────────────────────────────────
    def _check_rds(self, resource: Dict) -> List[IaCFinding]:
        findings = []
        attrs = resource["attributes"]
        rname = resource["name"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        if attrs.get("publicly_accessible") is True:
            findings.append(IaCFinding(
                rule_id="TF-RDS-001",
                title="RDS Instance Is Publicly Accessible",
                description=(
                    f"Resource `{rname}` has `publicly_accessible = true`. "
                    "This exposes the database endpoint directly to the internet, "
                    "bypassing VPC network isolation controls."
                ),
                severity="CRITICAL",
                service="rds",
                resource_type="aws_db_instance",
                resource_name=rname,
                file_path=fpath,
                line_number=line,
                remediation_hcl='  publicly_accessible = false  # Fix: Restrict to private VPC access only',
                compliance=["CIS AWS 2.3.2", "PCI DSS 1.3.2", "SOC2 CC6.6"],
                risk_score=97,
            ))

        if attrs.get("storage_encrypted") is False:
            findings.append(IaCFinding(
                rule_id="TF-RDS-002",
                title="RDS Storage Encryption Not Enabled",
                description=(
                    f"Resource `{rname}` has `storage_encrypted = false`. "
                    "Database data at rest is not encrypted, violating PCI DSS and SOC2 requirements."
                ),
                severity="HIGH",
                service="rds",
                resource_type="aws_db_instance",
                resource_name=rname,
                file_path=fpath,
                line_number=line,
                remediation_hcl='  storage_encrypted = true  # Fix: Enable AES-256 encryption at rest',
                compliance=["CIS AWS 2.3.1", "PCI DSS 3.4", "HIPAA § 164.312(a)(2)(iv)"],
                risk_score=80,
            ))

        backup_days = attrs.get("backup_retention_period")
        try:
            if int(backup_days) < 7:
                findings.append(IaCFinding(
                    rule_id="TF-RDS-003",
                    title="RDS Automated Backups Insufficient or Disabled",
                    description=(
                        f"Resource `{rname}` has `backup_retention_period = {backup_days}`. "
                        "Best practices require at least 7 days of automated backups for disaster recovery."
                    ),
                    severity="MEDIUM",
                    service="rds",
                    resource_type="aws_db_instance",
                    resource_name=rname,
                    file_path=fpath,
                    line_number=line,
                    remediation_hcl='  backup_retention_period = 7  # Fix: Retain 7+ days of backups',
                    compliance=["CIS AWS 2.3.4", "SOC2 A1.2"],
                    risk_score=55,
                ))
        except (TypeError, ValueError):
            pass

        if attrs.get("deletion_protection") is False:
            findings.append(IaCFinding(
                rule_id="TF-RDS-004",
                title="RDS Deletion Protection Disabled",
                description=(
                    f"Resource `{rname}` has `deletion_protection = false`. "
                    "Without deletion protection, the database can be accidentally or maliciously destroyed."
                ),
                severity="MEDIUM",
                service="rds",
                resource_type="aws_db_instance",
                resource_name=rname,
                file_path=fpath,
                line_number=line,
                remediation_hcl='  deletion_protection = true  # Fix: Prevent accidental deletion',
                compliance=["CIS AWS 2.3.7"],
                risk_score=60,
            ))

        # Default username check
        username = attrs.get("username", "")
        if username in ("admin", "root", "administrator", "postgres", "master"):
            findings.append(IaCFinding(
                rule_id="TF-RDS-005",
                title="RDS Using Default or Common Master Username",
                description=(
                    f"Resource `{rname}` uses a common/default username `{username}`. "
                    "Predictable usernames make credential attacks easier."
                ),
                severity="LOW",
                service="rds",
                resource_type="aws_db_instance",
                resource_name=rname,
                file_path=fpath,
                line_number=line,
                remediation_hcl='  username = "nimbus_svc"  # Fix: Use a non-default service account username',
                compliance=["CIS AWS 2.3.3"],
                risk_score=35,
            ))

        return findings

    # ─── IAM Checks ──────────────────────────────────────────────────────────
    def _check_iam_policy(self, resource: Dict) -> List[IaCFinding]:
        findings = []
        raw = resource["raw_block"]
        rname = resource["name"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        # Detect wildcard (*) action in policy
        if '"Action"' in raw or "'Action'" in raw:
            wildcard_action = re.search(r'"Action"\s*:\s*"\*"', raw)
            if wildcard_action:
                findings.append(IaCFinding(
                    rule_id="TF-IAM-001",
                    title="IAM Policy Grants Wildcard (*) Actions — Full Admin Access",
                    description=(
                        f"Resource `{rname}` contains `Action: '*'` which grants unrestricted administrative access. "
                        "This violates the principle of least privilege and is a critical security risk."
                    ),
                    severity="CRITICAL",
                    service="iam",
                    resource_type=resource["type"],
                    resource_name=rname,
                    file_path=fpath,
                    line_number=line,
                    remediation_hcl=(
                        '  # Fix: Replace wildcard with specific actions\n'
                        '  "Action": [\n'
                        '    "s3:GetObject",\n'
                        '    "s3:ListBucket"\n'
                        '  ]'
                    ),
                    compliance=["CIS AWS 1.16", "PCI DSS 7.1.2", "SOC2 CC6.3", "NIST SP 800-53 AC-6"],
                    risk_score=99,
                ))

        # Wildcard resource
        wildcard_resource = re.search(r'"Resource"\s*:\s*"\*"', raw)
        if wildcard_resource:
            findings.append(IaCFinding(
                rule_id="TF-IAM-002",
                title="IAM Policy Grants Access to All Resources (*)",
                description=(
                    f"Resource `{rname}` uses `Resource: '*'` granting access to every AWS resource in the account. "
                    "Scope policies to specific resource ARNs."
                ),
                severity="HIGH",
                service="iam",
                resource_type=resource["type"],
                resource_name=rname,
                file_path=fpath,
                line_number=line,
                remediation_hcl=(
                    '  # Fix: Restrict to specific resource ARN\n'
                    '  "Resource": "arn:aws:s3:::my-specific-bucket/*"'
                ),
                compliance=["CIS AWS 1.16", "NIST SP 800-53 AC-6"],
                risk_score=75,
            ))

        return findings

    def _check_iam_user(self, resource: Dict) -> List[IaCFinding]:
        """Detect IAM users in Terraform — users should be managed via SSO/roles."""
        findings = []
        rname = resource["name"]
        fpath = resource["file_path"]
        line = resource["line_number"]

        findings.append(IaCFinding(
            rule_id="TF-IAM-003",
            title="IAM User Defined in Terraform — Prefer IAM Roles or SSO",
            description=(
                f"Resource `{rname}` defines an IAM user directly. "
                "IAM users with long-lived credentials are a security risk. "
                "Use IAM Roles with temporary credentials or AWS SSO instead."
            ),
            severity="LOW",
            service="iam",
            resource_type="aws_iam_user",
            resource_name=rname,
            file_path=fpath,
            line_number=line,
            remediation_hcl=(
                '  # Fix: Replace IAM users with IAM Roles + OIDC or AWS SSO\n'
                '  # Remove aws_iam_user and use aws_iam_role with assume_role_policy'
            ),
            compliance=["CIS AWS 1.1", "AWS Best Practices"],
            risk_score=30,
        ))
        return findings


# ─── Main Scanner Orchestrator ────────────────────────────────────────────────
class TerraformScanner:
    """
    Main IaC scanner: parses Terraform files and applies all security rules.
    Returns a list of IaCFinding objects sorted by risk score.
    """

    def __init__(self):
        self.parser = TerraformHCLParser()
        self.rules = TerraformSecurityRules()

    def scan_directory(self, directory: str) -> Dict[str, Any]:
        """Scan all .tf files in a directory and return structured findings report."""
        logger.info(f"IaC scan starting: {directory}")

        resources = self.parser.parse_directory(directory)
        logger.info(f"Parsed {len(resources)} Terraform resources")

        all_findings: List[IaCFinding] = []
        for resource in resources:
            findings = self.rules.check(resource)
            all_findings.extend(findings)

        # Sort by risk score descending
        all_findings.sort(key=lambda f: f.risk_score, reverse=True)

        severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for f in all_findings:
            severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1

        max_score = max((f.risk_score for f in all_findings), default=0)

        return {
            "total_findings": len(all_findings),
            "severity_summary": severity_counts,
            "max_risk_score": max_score,
            "passed": len(all_findings) == 0,
            "resources_scanned": len(resources),
            "findings": [f.to_dict() for f in all_findings],
        }

    def scan_content(self, hcl_content: str, filename: str = "inline.tf") -> Dict[str, Any]:
        """Scan raw HCL content (e.g., from a PR diff payload)."""
        resources = self.parser._extract_resources(hcl_content, filename)
        all_findings: List[IaCFinding] = []
        for resource in resources:
            all_findings.extend(self.rules.check(resource))
        all_findings.sort(key=lambda f: f.risk_score, reverse=True)

        severity_counts = {"CRITICAL": 0, "HIGH": 0, "MEDIUM": 0, "LOW": 0}
        for f in all_findings:
            severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1

        return {
            "total_findings": len(all_findings),
            "severity_summary": severity_counts,
            "passed": len(all_findings) == 0,
            "resources_scanned": len(resources),
            "findings": [f.to_dict() for f in all_findings],
        }
