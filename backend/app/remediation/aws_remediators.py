"""
Remediators: every dry-run reads the LIVE before-state, every apply re-reads the after-state
to verify, and every action records an exact rollback.

The previous version returned success even when the boto3 call failed ("simulation mode"),
and the IAM/RDS apply() never called AWS at all. A security tool must never report a fix
it did not verify, so failures now raise and are reported as failures.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from botocore.exceptions import ClientError

from app.remediation.base_remediator import BaseRemediator
from app.utils.aws_client import get_aws_client

logger = logging.getLogger("nimbus.remediation")
ADMIN_PORTS = {"EC2-001": 22, "EC2-002": 3389}
PAB_ALL = {"BlockPublicAcls": True, "IgnorePublicAcls": True, "BlockPublicPolicy": True, "RestrictPublicBuckets": True}


class RemediationNotSupported(Exception):
    pass


def _bucket(resource_id: str) -> str:
    return resource_id.replace("arn:aws:s3:::", "").strip()


class _Base(BaseRemediator):
    action = ""
    downtime = "0 seconds"

    def __init__(self, resource_id: str, rule_id: str, region: Optional[str] = None):
        super().__init__(resource_id, rule_id)
        self.region = None if region in (None, "global") else region

    def client(self, service: str, purpose: str = "scan"):
        return get_aws_client(service, self.region, purpose=purpose)

    # subclasses implement: read_state, desired_state, mutate (returns rollback), cli
    def is_secure(self, state: Dict[str, Any]) -> bool:
        return state == self.desired_state(state)

    def dry_run(self) -> Dict[str, Any]:
        before = self.read_state()
        cmd, rollback = self.cli(before)
        already = self.is_secure(before)
        return {
            "rule_id": self.rule_id, "resource_id": self.resource_id, "action": self.action,
            "before_state": before, "after_state": self.desired_state(before),
            "already_compliant": already,
            "risk_reduction": "No change needed — resource already compliant" if already else "Closes this finding on next scan",
            "estimated_downtime": self.downtime, "remediation_cmd": cmd, "rollback_cmd": rollback,
        }

    def apply(self, actor: str = "system") -> Tuple[bool, str, Dict[str, Any]]:
        before = self.read_state()
        if self.is_secure(before):
            return True, "Resource already compliant; nothing changed.", {"action_executed": "noop", "rollback": {}}
        rollback = self.mutate(before)
        after = self.read_state()
        if not self.is_secure(after):
            return False, f"Applied {self.action} but verification failed: {after}", {"action_executed": self.action, "rollback": rollback}
        return True, f"{self.action} applied and verified.", {"action_executed": self.action, "rollback": rollback}


class S3PublicAccessBlock(_Base):
    action = "s3:PutPublicAccessBlock"

    def read_state(self):
        try:
            return self.client("s3").get_public_access_block(Bucket=_bucket(self.resource_id))["PublicAccessBlockConfiguration"]
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchPublicAccessBlockConfiguration":
                return {k: False for k in PAB_ALL}
            raise

    def desired_state(self, before):
        return dict(PAB_ALL)

    def mutate(self, before):
        self.client("s3", "remediate").put_public_access_block(Bucket=_bucket(self.resource_id), PublicAccessBlockConfiguration=PAB_ALL)
        return {"call": "put_public_access_block", "args": {"Bucket": _bucket(self.resource_id), "PublicAccessBlockConfiguration": before}}

    def cli(self, before):
        b = _bucket(self.resource_id)
        fmt = lambda d: ",".join(f"{k}={str(v).lower()}" for k, v in d.items())
        return (f"aws s3api put-public-access-block --bucket {b} --public-access-block-configuration {fmt(PAB_ALL)}",
                f"aws s3api put-public-access-block --bucket {b} --public-access-block-configuration {fmt(before)}")


class S3Versioning(_Base):
    action = "s3:PutBucketVersioning"

    def read_state(self):
        return {"Status": self.client("s3").get_bucket_versioning(Bucket=_bucket(self.resource_id)).get("Status", "Disabled")}

    def desired_state(self, before):
        return {"Status": "Enabled"}

    def mutate(self, before):
        self.client("s3", "remediate").put_bucket_versioning(Bucket=_bucket(self.resource_id), VersioningConfiguration={"Status": "Enabled"})
        return {"call": "put_bucket_versioning", "args": {"Bucket": _bucket(self.resource_id), "VersioningConfiguration": {"Status": "Suspended"}}}

    def cli(self, before):
        b = _bucket(self.resource_id)
        return (f"aws s3api put-bucket-versioning --bucket {b} --versioning-configuration Status=Enabled",
                f"aws s3api put-bucket-versioning --bucket {b} --versioning-configuration Status=Suspended")


class S3Encryption(_Base):
    action = "s3:PutBucketEncryption"
    CFG = {"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}, "BucketKeyEnabled": True}]}

    def read_state(self):
        try:
            rules = self.client("s3").get_bucket_encryption(Bucket=_bucket(self.resource_id))["ServerSideEncryptionConfiguration"]["Rules"]
            return {"SSEAlgorithm": rules[0]["ApplyServerSideEncryptionByDefault"]["SSEAlgorithm"]}
        except ClientError as e:
            if e.response["Error"]["Code"] == "ServerSideEncryptionConfigurationNotFoundError":
                return {"SSEAlgorithm": None}
            raise

    def is_secure(self, state):
        return state.get("SSEAlgorithm") in ("AES256", "aws:kms", "aws:kms:dsse")

    def desired_state(self, before):
        return before if self.is_secure(before) else {"SSEAlgorithm": "AES256"}

    def mutate(self, before):
        self.client("s3", "remediate").put_bucket_encryption(Bucket=_bucket(self.resource_id), ServerSideEncryptionConfiguration=self.CFG)
        return {"call": "delete_bucket_encryption", "args": {"Bucket": _bucket(self.resource_id)}}

    def cli(self, before):
        b = _bucket(self.resource_id)
        return (f"aws s3api put-bucket-encryption --bucket {b} --server-side-encryption-configuration "
                "'{\"Rules\":[{\"ApplyServerSideEncryptionByDefault\":{\"SSEAlgorithm\":\"AES256\"}}]}'",
                f"aws s3api delete-bucket-encryption --bucket {b}")


class EC2RevokeWorldIngress(_Base):
    """Revokes only the world-open rules covering the admin port (22 or 3389) — nothing else."""
    action = "ec2:RevokeSecurityGroupIngress"

    @property
    def port(self):
        return ADMIN_PORTS[self.rule_id]

    def _open_perms(self):
        sg = self.client("ec2").describe_security_groups(GroupIds=[self.resource_id])["SecurityGroups"][0]
        out = []
        for p in sg.get("IpPermissions", []):
            covers = p.get("IpProtocol") == "-1" or (p.get("FromPort", -1) <= self.port <= p.get("ToPort", -1))
            v4 = [{"CidrIp": r["CidrIp"]} for r in p.get("IpRanges", []) if r.get("CidrIp") == "0.0.0.0/0"]
            v6 = [{"CidrIpv6": r["CidrIpv6"]} for r in p.get("Ipv6Ranges", []) if r.get("CidrIpv6") == "::/0"]
            if covers and (v4 or v6):
                perm = {"IpProtocol": p["IpProtocol"], "IpRanges": v4, "Ipv6Ranges": v6}
                if "FromPort" in p:
                    perm.update(FromPort=p["FromPort"], ToPort=p["ToPort"])
                out.append(perm)
        return out

    def read_state(self):
        perms = self._open_perms()
        return {"world_open_rules": [f"{p['IpProtocol']}:{p.get('FromPort', 'all')}-{p.get('ToPort', 'all')}" for p in perms],
                "_perms": perms}

    def is_secure(self, state):
        return not state["world_open_rules"]

    def desired_state(self, before):
        return {"world_open_rules": [], "_perms": []}

    def mutate(self, before):
        self.client("ec2", "remediate").revoke_security_group_ingress(GroupId=self.resource_id, IpPermissions=before["_perms"])
        return {"call": "authorize_security_group_ingress", "args": {"GroupId": self.resource_id, "IpPermissions": before["_perms"]}}

    def cli(self, before):
        r = f" --region {self.region}" if self.region else ""
        return (f"aws ec2 revoke-security-group-ingress --group-id {self.resource_id} --protocol tcp --port {self.port} --cidr 0.0.0.0/0{r}",
                f"aws ec2 authorize-security-group-ingress --group-id {self.resource_id} --protocol tcp --port {self.port} --cidr 0.0.0.0/0{r}")

    def dry_run(self):
        d = super().dry_run()
        d["before_state"].pop("_perms", None)
        d["after_state"].pop("_perms", None)
        d["estimated_downtime"] = "0s, but anyone relying on public access to this port loses it — use SSM Session Manager instead"
        return d


class EC2RequireIMDSv2(_Base):
    action = "ec2:ModifyInstanceMetadataOptions"

    def read_state(self):
        i = self.client("ec2").describe_instances(InstanceIds=[self.resource_id])["Reservations"][0]["Instances"][0]
        return {"HttpTokens": i.get("MetadataOptions", {}).get("HttpTokens")}

    def desired_state(self, before):
        return {"HttpTokens": "required"}

    def mutate(self, before):
        self.client("ec2", "remediate").modify_instance_metadata_options(InstanceId=self.resource_id, HttpTokens="required", HttpEndpoint="enabled")
        return {"call": "modify_instance_metadata_options", "args": {"InstanceId": self.resource_id, "HttpTokens": before["HttpTokens"] or "optional"}}

    def cli(self, before):
        return (f"aws ec2 modify-instance-metadata-options --instance-id {self.resource_id} --http-tokens required",
                f"aws ec2 modify-instance-metadata-options --instance-id {self.resource_id} --http-tokens optional")


class RDSDisablePublic(_Base):
    action = "rds:ModifyDBInstance(PubliclyAccessible=false)"
    downtime = "0s (endpoint DNS resolves to private IP; clients outside the VPC lose access)"

    @property
    def db_id(self):
        return self.resource_id.split(":")[-1]

    def read_state(self):
        db = self.client("rds").describe_db_instances(DBInstanceIdentifier=self.db_id)["DBInstances"][0]
        pending = (db.get("PendingModifiedValues") or {}).get("PubliclyAccessible")
        return {"PubliclyAccessible": db["PubliclyAccessible"] if pending is None else pending}

    def desired_state(self, before):
        return {"PubliclyAccessible": False}

    def mutate(self, before):
        self.client("rds", "remediate").modify_db_instance(DBInstanceIdentifier=self.db_id, PubliclyAccessible=False, ApplyImmediately=True)
        return {"call": "modify_db_instance", "args": {"DBInstanceIdentifier": self.db_id, "PubliclyAccessible": True, "ApplyImmediately": True}}

    def cli(self, before):
        return (f"aws rds modify-db-instance --db-instance-identifier {self.db_id} --no-publicly-accessible --apply-immediately",
                f"aws rds modify-db-instance --db-instance-identifier {self.db_id} --publicly-accessible --apply-immediately")


class IAMDeactivateOldKeys(_Base):
    action = "iam:UpdateAccessKey(Status=Inactive)"
    downtime = "Any app using these keys fails auth immediately — confirm with the owner first"

    @property
    def user(self):
        return self.resource_id.split("/")[-1]

    def read_state(self):
        keys = self.client("iam").list_access_keys(UserName=self.user)["AccessKeyMetadata"]
        cutoff = datetime.now(timezone.utc) - timedelta(days=90)
        return {"old_active_keys": sorted(k["AccessKeyId"] for k in keys if k["Status"] == "Active" and k["CreateDate"] < cutoff)}

    def is_secure(self, state):
        return not state["old_active_keys"]

    def desired_state(self, before):
        return {"old_active_keys": []}

    def mutate(self, before):
        iam = self.client("iam", "remediate")
        for k in before["old_active_keys"]:
            iam.update_access_key(UserName=self.user, AccessKeyId=k, Status="Inactive")
        return {"call": "update_access_key",
                "args": [{"UserName": self.user, "AccessKeyId": k, "Status": "Active"} for k in before["old_active_keys"]]}

    def cli(self, before):
        keys = before["old_active_keys"] or ["<key-id>"]
        return ("; ".join(f"aws iam update-access-key --user-name {self.user} --access-key-id {k} --status Inactive" for k in keys),
                "; ".join(f"aws iam update-access-key --user-name {self.user} --access-key-id {k} --status Active" for k in keys))


REGISTRY = {
    "S3-001": S3PublicAccessBlock, "S3-005": S3PublicAccessBlock,
    "S3-002": S3Encryption, "S3-003": S3Versioning,
    "EC2-001": EC2RevokeWorldIngress, "EC2-002": EC2RevokeWorldIngress,
    "EC2-005": EC2RequireIMDSv2,
    "RDS-001": RDSDisablePublic,
    "IAM-004": IAMDeactivateOldKeys,
}

# Deliberately NOT automated — the fix needs a human, a device, or a data migration.
MANUAL_ONLY = {
    "IAM-001": "Root MFA requires the account owner to register an MFA device in the console (Security credentials page).",
    "IAM-002": "User MFA requires the user to enrol a device; then enforce with a policy that denies actions when aws:MultiFactorAuthPresent is false.",
    "IAM-003": "Replace AdministratorAccess with least-privilege (IAM Access Analyzer can generate a policy from CloudTrail activity).",
    "IAM-005": "Confirm the user is unused, then disable console access and deactivate keys.",
    "EC2-003": "Existing EBS volumes are encrypted via snapshot -> encrypted copy -> new volume. Turn on EBS encryption-by-default for new ones.",
    "EC2-004": "Scope the all-traffic rule to specific ports and CIDRs based on what the workload needs.",
    "RDS-002": "RDS encryption requires snapshot -> encrypted copy -> restore (plan a maintenance window).",
    "RDS-003": "Set BackupRetentionPeriod >= 7 days (modify-db-instance) during a maintenance window.",
    "RDS-004": "The master username cannot be changed in place; migrate or switch apps to IAM database auth.",
    "S3-004": "Access logging needs a dedicated target bucket; create it, then enable logging.",
}


def get_remediator_for_finding(rule_id: str, resource_id: str, region: Optional[str] = None) -> BaseRemediator:
    cls = REGISTRY.get(rule_id)
    if cls is None:
        raise RemediationNotSupported(MANUAL_ONLY.get(rule_id, f"No automated remediation for {rule_id}."))
    return cls(resource_id, rule_id, region)
