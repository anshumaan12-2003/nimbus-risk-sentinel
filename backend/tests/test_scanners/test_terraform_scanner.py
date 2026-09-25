"""
Breachpath Cloud Recon — Unit Tests for Terraform IaC Security Scanner
Tests all rule categories: S3, EC2/SG, RDS, IAM.
"""

import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
from app.scanner.iac.terraform_scanner import TerraformScanner, TerraformHCLParser, TerraformSecurityRules


# ─── Fixtures ─────────────────────────────────────────────────────────────────
@pytest.fixture
def scanner():
    return TerraformScanner()


@pytest.fixture
def parser():
    return TerraformHCLParser()


@pytest.fixture
def rules():
    return TerraformSecurityRules()


# ─── S3 Tests ─────────────────────────────────────────────────────────────────
class TestS3Rules:
    def test_detects_public_access_block_disabled(self, scanner):
        hcl = """
resource "aws_s3_bucket_public_access_block" "test" {
  bucket                  = "my-bucket"
  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = true
  restrict_public_buckets = true
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        assert result["total_findings"] >= 2
        rule_ids = {f["rule_id"] for f in result["findings"]}
        assert "TF-S3-001" in rule_ids
        assert "TF-S3-002" in rule_ids

    def test_no_findings_when_all_access_blocked(self, scanner):
        hcl = """
resource "aws_s3_bucket_public_access_block" "secure" {
  bucket                  = "my-bucket"
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = true
  restrict_public_buckets = true
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        s3_findings = [f for f in result["findings"] if f["service"] == "s3"]
        assert len(s3_findings) == 0


# ─── Security Group Tests ─────────────────────────────────────────────────────
class TestSecurityGroupRules:
    def test_detects_ssh_open_to_world(self, scanner):
        hcl = """
resource "aws_security_group" "test_sg" {
  name = "test-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        rule_ids = {f["rule_id"] for f in result["findings"]}
        assert "TF-EC2-001" in rule_ids

    def test_detects_rdp_open_to_world(self, scanner):
        hcl = """
resource "aws_security_group" "rdp_sg" {
  name = "rdp-sg"

  ingress {
    from_port   = 3389
    to_port     = 3389
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        rule_ids = {f["rule_id"] for f in result["findings"]}
        assert "TF-EC2-002" in rule_ids

    def test_no_finding_for_restricted_ssh(self, scanner):
        hcl = """
resource "aws_security_group" "safe_sg" {
  name = "safe-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        ssh_findings = [f for f in result["findings"] if f.get("rule_id") == "TF-EC2-001"]
        assert len(ssh_findings) == 0


# ─── RDS Tests ────────────────────────────────────────────────────────────────
class TestRDSRules:
    def test_detects_publicly_accessible_rds(self, scanner):
        hcl = """
resource "aws_db_instance" "prod_db" {
  identifier          = "prod-db"
  engine              = "postgres"
  instance_class      = "db.t3.micro"
  publicly_accessible = true
  username            = "admin"
  password            = "secret"
  storage_encrypted   = false
  backup_retention_period = 0
  deletion_protection = false
  skip_final_snapshot = true
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        rule_ids = {f["rule_id"] for f in result["findings"]}
        assert "TF-RDS-001" in rule_ids   # publicly accessible
        assert "TF-RDS-002" in rule_ids   # not encrypted
        assert "TF-RDS-003" in rule_ids   # no backups
        assert "TF-RDS-005" in rule_ids   # default username

    def test_secure_rds_no_findings(self, scanner):
        hcl = """
resource "aws_db_instance" "secure_db" {
  identifier              = "secure-db"
  engine                  = "postgres"
  instance_class          = "db.t3.small"
  publicly_accessible     = false
  username                = "nimbus_svc"
  password                = "complex-secret"
  storage_encrypted       = true
  backup_retention_period = 14
  deletion_protection     = true
  skip_final_snapshot     = false
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        rds_findings = [f for f in result["findings"] if f["service"] == "rds"]
        assert len(rds_findings) == 0


# ─── IAM Tests ────────────────────────────────────────────────────────────────
class TestIAMRules:
    def test_detects_wildcard_action(self, scanner):
        hcl = """
resource "aws_iam_role_policy" "dangerous_policy" {
  name = "dangerous"
  role = "my-role"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        "Action"   : "*"
        "Resource" : "*"
      }
    ]
  })
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        rule_ids = {f["rule_id"] for f in result["findings"]}
        assert "TF-IAM-001" in rule_ids

    def test_detects_iam_user(self, scanner):
        hcl = """
resource "aws_iam_user" "service_account" {
  name = "my-service-user"
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        rule_ids = {f["rule_id"] for f in result["findings"]}
        assert "TF-IAM-003" in rule_ids


# ─── Scanner Output Structure Tests ───────────────────────────────────────────
class TestScannerOutputStructure:
    def test_scan_result_has_required_fields(self, scanner):
        result = scanner.scan_content('resource "aws_s3_bucket" "test" { bucket = "test" }', "test.tf")
        assert "total_findings" in result
        assert "severity_summary" in result
        assert "findings" in result
        assert "passed" in result
        assert "resources_scanned" in result

    def test_findings_sorted_by_risk_score(self, scanner):
        hcl = """
resource "aws_db_instance" "test" {
  identifier          = "test"
  engine              = "postgres"
  instance_class      = "db.t3.micro"
  publicly_accessible = true
  username            = "admin"
  password            = "pw"
  storage_encrypted   = false
  backup_retention_period = 0
  deletion_protection = false
  skip_final_snapshot = true
}
"""
        result = scanner.scan_content(hcl, "test.tf")
        scores = [f["risk_score"] for f in result["findings"]]
        assert scores == sorted(scores, reverse=True)

    def test_passed_true_when_no_findings(self, scanner):
        result = scanner.scan_content("# Empty terraform file", "empty.tf")
        assert result["passed"] is True
        assert result["total_findings"] == 0
