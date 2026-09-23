import json
import logging
from botocore.exceptions import ClientError
from app.scanner.base_scanner import BaseScanner, ScanFinding
from app.models.finding import Severity
from app.utils.aws_client import get_aws_client

logger = logging.getLogger(__name__)


class S3Scanner(BaseScanner):
    """
    Scans AWS S3 buckets for security misconfigurations.
    
    Rules:
      S3-001: Public Access Block not fully enabled
      S3-002: Default encryption (SSE) not enabled
      S3-003: Versioning not enabled
      S3-004: Access logging not enabled
      S3-005: Bucket policy allows public read/write
    """

    def __init__(self, region: str = "us-east-1"):
        super().__init__(region)
        self.s3 = get_aws_client("s3", region)

    def scan(self) -> list[ScanFinding]:
        """Scan all S3 buckets in the account."""
        logger.info("Starting S3 scan...")
        try:
            response = self.s3.list_buckets()
            buckets = response.get("Buckets", [])
            logger.info(f"Found {len(buckets)} S3 buckets")

            for bucket in buckets:
                bucket_name = bucket["Name"]
                try:
                    self._check_public_access_block(bucket_name)
                    self._check_encryption(bucket_name)
                    self._check_versioning(bucket_name)
                    self._check_logging(bucket_name)
                    self._check_bucket_policy(bucket_name)
                except ClientError as e:
                    code = e.response["Error"]["Code"]
                    if code == "NoSuchBucket":
                        continue
                    logger.warning(f"Error scanning bucket {bucket_name}: {e}")
                except Exception as e:
                    logger.warning(f"Unexpected error for bucket {bucket_name}: {e}")

        except ClientError as e:
            logger.error(f"Failed to list S3 buckets: {e}")

        logger.info(f"S3 scan complete. Found {len(self.findings)} findings.")
        return self.findings

    # ─── Rule: S3-001 ─────────────────────────────────────────────────────
    def _check_public_access_block(self, bucket_name: str):
        try:
            resp = self.s3.get_public_access_block(Bucket=bucket_name)
            config = resp.get("PublicAccessBlockConfiguration", {})
            all_blocked = all([
                config.get("BlockPublicAcls", False),
                config.get("IgnorePublicAcls", False),
                config.get("BlockPublicPolicy", False),
                config.get("RestrictPublicBuckets", False),
            ])
            if not all_blocked:
                missing = [
                    k for k, v in config.items() if not v
                ]
                self.add_finding(ScanFinding(
                    rule_id="S3-001",
                    title="S3 Bucket Public Access Block Not Fully Enabled",
                    description=(
                        f"Bucket '{bucket_name}' does not have all public access block "
                        f"settings enabled. Missing: {', '.join(missing)}. "
                        "This may allow public exposure of bucket contents."
                    ),
                    severity=Severity.HIGH,
                    service="s3",
                    resource_id=f"arn:aws:s3:::{bucket_name}",
                    resource_type="s3_bucket",
                    resource_name=bucket_name,
                    region="global",
                    recommendation=(
                        "Enable all four public access block settings: BlockPublicAcls, "
                        "IgnorePublicAcls, BlockPublicPolicy, and RestrictPublicBuckets."
                    ),
                    remediation_cmd=(
                        f'aws s3api put-public-access-block --bucket {bucket_name} '
                        f'--public-access-block-configuration '
                        f'BlockPublicAcls=true,IgnorePublicAcls=true,'
                        f'BlockPublicPolicy=true,RestrictPublicBuckets=true'
                    ),
                ))
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchPublicAccessBlockConfiguration":
                # No config set at all → all public access is ALLOWED
                self.add_finding(ScanFinding(
                    rule_id="S3-001",
                    title="S3 Bucket Has No Public Access Block Configuration",
                    description=(
                        f"Bucket '{bucket_name}' has no public access block configured. "
                        "This means the bucket could be made public via ACLs or policies."
                    ),
                    severity=Severity.CRITICAL,
                    service="s3",
                    resource_id=f"arn:aws:s3:::{bucket_name}",
                    resource_type="s3_bucket",
                    resource_name=bucket_name,
                    region="global",
                    recommendation="Enable public access block on this bucket immediately.",
                    remediation_cmd=(
                        f'aws s3api put-public-access-block --bucket {bucket_name} '
                        f'--public-access-block-configuration '
                        f'BlockPublicAcls=true,IgnorePublicAcls=true,'
                        f'BlockPublicPolicy=true,RestrictPublicBuckets=true'
                    ),
                ))

    # ─── Rule: S3-002 ─────────────────────────────────────────────────────
    def _check_encryption(self, bucket_name: str):
        try:
            self.s3.get_bucket_encryption(Bucket=bucket_name)
        except ClientError as e:
            if e.response["Error"]["Code"] == "ServerSideEncryptionConfigurationNotFoundError":
                self.add_finding(ScanFinding(
                    rule_id="S3-002",
                    title="S3 Bucket Server-Side Encryption Not Enabled",
                    description=(
                        f"Bucket '{bucket_name}' does not have default server-side "
                        "encryption enabled. Data stored in this bucket is not encrypted at rest."
                    ),
                    severity=Severity.HIGH,
                    service="s3",
                    resource_id=f"arn:aws:s3:::{bucket_name}",
                    resource_type="s3_bucket",
                    resource_name=bucket_name,
                    region="global",
                    recommendation="Enable AES-256 or AWS KMS server-side encryption.",
                    remediation_cmd=(
                        f'aws s3api put-bucket-encryption --bucket {bucket_name} '
                        f'--server-side-encryption-configuration \''
                        f'{{"Rules":[{{"ApplyServerSideEncryptionByDefault":{{"SSEAlgorithm":"AES256"}}}}]}}\''
                    ),
                ))

    # ─── Rule: S3-003 ─────────────────────────────────────────────────────
    def _check_versioning(self, bucket_name: str):
        resp = self.s3.get_bucket_versioning(Bucket=bucket_name)
        status = resp.get("Status", "")
        if status != "Enabled":
            self.add_finding(ScanFinding(
                rule_id="S3-003",
                title="S3 Bucket Versioning Not Enabled",
                description=(
                    f"Bucket '{bucket_name}' does not have versioning enabled "
                    f"(current status: '{status or 'Disabled'}'). "
                    "Without versioning, accidental deletion or overwriting of objects is unrecoverable."
                ),
                severity=Severity.MEDIUM,
                service="s3",
                resource_id=f"arn:aws:s3:::{bucket_name}",
                resource_type="s3_bucket",
                resource_name=bucket_name,
                region="global",
                recommendation="Enable versioning to protect against accidental data loss.",
                remediation_cmd=(
                    f'aws s3api put-bucket-versioning --bucket {bucket_name} '
                    f'--versioning-configuration Status=Enabled'
                ),
            ))

    # ─── Rule: S3-004 ─────────────────────────────────────────────────────
    def _check_logging(self, bucket_name: str):
        resp = self.s3.get_bucket_logging(Bucket=bucket_name)
        if "LoggingEnabled" not in resp:
            self.add_finding(ScanFinding(
                rule_id="S3-004",
                title="S3 Bucket Access Logging Not Enabled",
                description=(
                    f"Bucket '{bucket_name}' does not have server access logging enabled. "
                    "Without logging, there is no audit trail for data access — critical for "
                    "forensic investigation after a security incident."
                ),
                severity=Severity.LOW,
                service="s3",
                resource_id=f"arn:aws:s3:::{bucket_name}",
                resource_type="s3_bucket",
                resource_name=bucket_name,
                region="global",
                recommendation="Enable server access logging to a dedicated logging bucket.",
                remediation_cmd=(
                    f'aws s3api put-bucket-logging --bucket {bucket_name} '
                    f'--bucket-logging-status \'{{"LoggingEnabled":{{"TargetBucket":"your-log-bucket","TargetPrefix":"{bucket_name}/"}}}}\''
                ),
            ))

    # ─── Rule: S3-005 ─────────────────────────────────────────────────────
    def _check_bucket_policy(self, bucket_name: str):
        try:
            resp = self.s3.get_bucket_policy(Bucket=bucket_name)
            policy = json.loads(resp["Policy"])
            for statement in policy.get("Statement", []):
                if (
                    statement.get("Effect") == "Allow"
                    and statement.get("Principal") in ("*", {"AWS": "*"})
                    and statement.get("Action") in (
                        "s3:GetObject", "s3:*", ["s3:GetObject"], ["s3:*"]
                    )
                ):
                    self.add_finding(ScanFinding(
                        rule_id="S3-005",
                        title="S3 Bucket Policy Allows Public Access",
                        description=(
                            f"Bucket '{bucket_name}' has a bucket policy with a "
                            "statement that grants public access (Principal: '*'). "
                            "This makes the bucket publicly accessible to anyone on the internet."
                        ),
                        severity=Severity.CRITICAL,
                        service="s3",
                        resource_id=f"arn:aws:s3:::{bucket_name}",
                        resource_type="s3_bucket",
                        resource_name=bucket_name,
                        region="global",
                        recommendation=(
                            "Remove the public-access statement from the bucket policy "
                            "and restrict access to specific principals."
                        ),
                        remediation_cmd=(
                            f'aws s3api delete-bucket-policy --bucket {bucket_name} '
                            f'# WARNING: Review policy before deleting'
                        ),
                    ))
                    break
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchBucketPolicy":
                pass  # No policy = no public access via policy (fine)
