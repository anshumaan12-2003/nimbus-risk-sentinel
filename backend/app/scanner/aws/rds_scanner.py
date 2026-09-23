import logging
from botocore.exceptions import ClientError
from app.scanner.base_scanner import BaseScanner, ScanFinding
from app.models.finding import Severity
from app.utils.aws_client import get_aws_client

logger = logging.getLogger(__name__)

COMMON_DEFAULT_USERNAMES = {"admin", "root", "postgres", "administrator", "master", "user", "dbadmin"}


class RDSScanner(BaseScanner):
    """
    Scans AWS RDS instances for security misconfigurations.

    Rules:
      RDS-001: RDS instance publicly accessible
      RDS-002: RDS storage encryption not enabled
      RDS-003: Automated backups disabled
      RDS-004: Default master username used
    """

    def __init__(self, region: str):
        super().__init__(region)
        self.rds = get_aws_client("rds", region)

    def scan(self) -> list[ScanFinding]:
        logger.info(f"Starting RDS scan in region {self.region}...")
        try:
            paginator = self.rds.get_paginator("describe_db_instances")
            for page in paginator.paginate():
                for instance in page["DBInstances"]:
                    if instance.get("DBInstanceStatus") == "available":
                        self._check_public_access(instance)
                        self._check_encryption(instance)
                        self._check_backups(instance)
                        self._check_default_username(instance)
        except ClientError as e:
            logger.error(f"RDS scan failed in {self.region}: {e}")

        logger.info(f"RDS scan complete. Found {len(self.findings)} findings.")
        return self.findings

    def _get_instance_name(self, instance: dict) -> str:
        return instance.get("DBInstanceIdentifier", "unknown")

    # ─── Rule: RDS-001 ────────────────────────────────────────────────────
    def _check_public_access(self, instance: dict):
        if instance.get("PubliclyAccessible", False):
            db_id = instance["DBInstanceIdentifier"]
            db_arn = instance.get("DBInstanceArn", db_id)
            engine = instance.get("Engine", "unknown")
            self.add_finding(ScanFinding(
                rule_id="RDS-001",
                title=f"RDS Instance '{db_id}' Is Publicly Accessible",
                description=(
                    f"RDS instance '{db_id}' (engine: {engine}) is configured as publicly accessible. "
                    "This means the database endpoint resolves to a public IP address and can be "
                    "reached from the internet. Database instances should never be publicly accessible."
                ),
                severity=Severity.CRITICAL,
                service="rds",
                resource_id=db_arn,
                resource_type="rds_instance",
                resource_name=db_id,
                region=self.region,
                recommendation=(
                    "Disable public accessibility and place the RDS instance in a private subnet. "
                    "Access the database through a bastion host or VPN."
                ),
                remediation_cmd=(
                    f'aws rds modify-db-instance --db-instance-identifier {db_id} '
                    f'--no-publicly-accessible --apply-immediately --region {self.region}'
                ),
            ))

    # ─── Rule: RDS-002 ────────────────────────────────────────────────────
    def _check_encryption(self, instance: dict):
        if not instance.get("StorageEncrypted", False):
            db_id = instance["DBInstanceIdentifier"]
            db_arn = instance.get("DBInstanceArn", db_id)
            engine = instance.get("Engine", "unknown")
            self.add_finding(ScanFinding(
                rule_id="RDS-002",
                title=f"RDS Instance '{db_id}' Storage Is Not Encrypted",
                description=(
                    f"RDS instance '{db_id}' (engine: {engine}) does not have storage encryption enabled. "
                    "Unencrypted database storage could expose sensitive data if the underlying "
                    "storage media is compromised. Many compliance standards (HIPAA, PCI-DSS) "
                    "require database encryption."
                ),
                severity=Severity.HIGH,
                service="rds",
                resource_id=db_arn,
                resource_type="rds_instance",
                resource_name=db_id,
                region=self.region,
                recommendation=(
                    "Enable encryption at rest. Note: Encryption can only be enabled on a new instance. "
                    "To encrypt an existing instance: take a snapshot, copy with encryption enabled, "
                    "then restore from the encrypted snapshot."
                ),
                remediation_cmd=(
                    f'# Create encrypted snapshot:\n'
                    f'aws rds create-db-snapshot --db-instance-identifier {db_id} '
                    f'--db-snapshot-identifier {db_id}-enc-snapshot --region {self.region}\n'
                    f'# Then copy with encryption and restore'
                ),
            ))

    # ─── Rule: RDS-003 ────────────────────────────────────────────────────
    def _check_backups(self, instance: dict):
        retention = instance.get("BackupRetentionPeriod", 0)
        if retention == 0:
            db_id = instance["DBInstanceIdentifier"]
            db_arn = instance.get("DBInstanceArn", db_id)
            self.add_finding(ScanFinding(
                rule_id="RDS-003",
                title=f"RDS Instance '{db_id}' Has Automated Backups Disabled",
                description=(
                    f"RDS instance '{db_id}' has automated backup retention period set to 0 days, "
                    "meaning automated backups are disabled. Without backups, data lost due to "
                    "accidental deletion, corruption, or a security incident cannot be recovered."
                ),
                severity=Severity.HIGH,
                service="rds",
                resource_id=db_arn,
                resource_type="rds_instance",
                resource_name=db_id,
                region=self.region,
                recommendation=(
                    "Enable automated backups with a retention period of at least 7 days (35 days for production)."
                ),
                remediation_cmd=(
                    f'aws rds modify-db-instance --db-instance-identifier {db_id} '
                    f'--backup-retention-period 7 --apply-immediately --region {self.region}'
                ),
            ))

    # ─── Rule: RDS-004 ────────────────────────────────────────────────────
    def _check_default_username(self, instance: dict):
        master_username = instance.get("MasterUsername", "").lower()
        if master_username in COMMON_DEFAULT_USERNAMES:
            db_id = instance["DBInstanceIdentifier"]
            db_arn = instance.get("DBInstanceArn", db_id)
            self.add_finding(ScanFinding(
                rule_id="RDS-004",
                title=f"RDS Instance '{db_id}' Uses Default Master Username '{master_username}'",
                description=(
                    f"RDS instance '{db_id}' uses a common/default master username '{master_username}'. "
                    "Attackers targeting databases often try common usernames first. "
                    "Using a default username makes credential brute-force attacks more likely to succeed."
                ),
                severity=Severity.MEDIUM,
                service="rds",
                resource_id=db_arn,
                resource_type="rds_instance",
                resource_name=db_id,
                region=self.region,
                recommendation=(
                    "Use a unique, non-guessable master username when creating RDS instances. "
                    "Note: the master username cannot be changed after instance creation. "
                    "Consider creating a new instance with a secure username."
                ),
                remediation_cmd="# Master username cannot be changed. Plan migration to a new instance with secure credentials.",
            ))
