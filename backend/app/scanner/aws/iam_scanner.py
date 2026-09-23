import logging
from datetime import datetime, timezone, timedelta
from botocore.exceptions import ClientError
from app.scanner.base_scanner import BaseScanner, ScanFinding
from app.models.finding import Severity
from app.utils.aws_client import get_aws_client

logger = logging.getLogger(__name__)


class IAMScanner(BaseScanner):
    """
    Scans AWS IAM for security misconfigurations.

    Rules:
      IAM-001: Root account MFA not enabled
      IAM-002: IAM users without MFA
      IAM-003: Users with admin/wildcard permissions
      IAM-004: Access keys older than 90 days
      IAM-005: Inactive IAM users (no login > 90 days)
    """

    def __init__(self, region: str = "us-east-1"):
        super().__init__(region)
        self.iam = get_aws_client("iam", region)

    def scan(self) -> list[ScanFinding]:
        logger.info("Starting IAM scan...")
        try:
            self._check_root_mfa()
            users = self._get_all_users()
            for user in users:
                self._check_user_mfa(user)
                self._check_admin_permissions(user)
                self._check_old_access_keys(user)
                self._check_inactive_user(user)
        except ClientError as e:
            logger.error(f"IAM scan failed: {e}")

        logger.info(f"IAM scan complete. Found {len(self.findings)} findings.")
        return self.findings

    def _get_all_users(self) -> list[dict]:
        users = []
        paginator = self.iam.get_paginator("list_users")
        for page in paginator.paginate():
            users.extend(page["Users"])
        return users

    # ─── Rule: IAM-001 ────────────────────────────────────────────────────
    def _check_root_mfa(self):
        try:
            summary = self.iam.get_account_summary()
            stats = summary["SummaryMap"]
            if not stats.get("AccountMFAEnabled", 0):
                self.add_finding(ScanFinding(
                    rule_id="IAM-001",
                    title="Root Account MFA Not Enabled",
                    description=(
                        "The AWS root account does not have Multi-Factor Authentication (MFA) enabled. "
                        "The root account has unrestricted access to all resources. "
                        "If compromised, an attacker gains complete control of the entire AWS account."
                    ),
                    severity=Severity.CRITICAL,
                    service="iam",
                    resource_id="arn:aws:iam::root",
                    resource_type="iam_root",
                    resource_name="AWS Root Account",
                    region="global",
                    recommendation=(
                        "Enable MFA on the root account immediately. "
                        "Use a hardware MFA device or virtual MFA app. "
                        "After enabling, avoid using root credentials for day-to-day operations."
                    ),
                    remediation_cmd="# Enable root MFA via AWS Console: IAM → Dashboard → Activate MFA on root account",
                ))
        except ClientError as e:
            logger.warning(f"Could not check root MFA: {e}")

    # ─── Rule: IAM-002 ────────────────────────────────────────────────────
    def _check_user_mfa(self, user: dict):
        username = user["UserName"]
        try:
            mfa_devices = self.iam.list_mfa_devices(UserName=username)
            if not mfa_devices["MFADevices"]:
                # Only flag if user has console access
                try:
                    self.iam.get_login_profile(UserName=username)
                    has_console = True
                except ClientError as e:
                    has_console = e.response["Error"]["Code"] != "NoSuchEntity"

                if has_console:
                    self.add_finding(ScanFinding(
                        rule_id="IAM-002",
                        title=f"IAM User '{username}' Has No MFA Device",
                        description=(
                            f"IAM user '{username}' has console access but no MFA device configured. "
                            "Without MFA, a stolen password gives full access to this user's permissions."
                        ),
                        severity=Severity.HIGH,
                        service="iam",
                        resource_id=user["Arn"],
                        resource_type="iam_user",
                        resource_name=username,
                        region="global",
                        recommendation="Assign a virtual or hardware MFA device to this user.",
                        remediation_cmd=f"# Enable MFA for {username} via AWS Console or CLI",
                    ))
        except ClientError as e:
            logger.warning(f"Could not check MFA for {username}: {e}")

    # ─── Rule: IAM-003 ────────────────────────────────────────────────────
    def _check_admin_permissions(self, user: dict):
        username = user["UserName"]
        try:
            # Check attached managed policies
            attached = self.iam.list_attached_user_policies(UserName=username)
            for policy in attached["AttachedPolicies"]:
                if policy["PolicyName"] == "AdministratorAccess":
                    self.add_finding(ScanFinding(
                        rule_id="IAM-003",
                        title=f"IAM User '{username}' Has Administrator Access",
                        description=(
                            f"User '{username}' has the AWS managed 'AdministratorAccess' policy attached, "
                            "granting full access to all AWS services and resources (Action: *, Resource: *). "
                            "This violates the principle of least privilege."
                        ),
                        severity=Severity.HIGH,
                        service="iam",
                        resource_id=user["Arn"],
                        resource_type="iam_user",
                        resource_name=username,
                        region="global",
                        recommendation=(
                            "Replace AdministratorAccess with a custom policy granting only the "
                            "permissions this user actually needs. Use AWS Access Analyzer to identify "
                            "required permissions."
                        ),
                        remediation_cmd=(
                            f'aws iam detach-user-policy --user-name {username} '
                            f'--policy-arn arn:aws:iam::aws:policy/AdministratorAccess'
                        ),
                    ))

            # Check inline policies for wildcard actions
            inline = self.iam.list_user_policies(UserName=username)
            for policy_name in inline["PolicyNames"]:
                policy_doc = self.iam.get_user_policy(
                    UserName=username, PolicyName=policy_name
                )
                doc = policy_doc["PolicyDocument"]
                for stmt in doc.get("Statement", []):
                    actions = stmt.get("Action", [])
                    if isinstance(actions, str):
                        actions = [actions]
                    if "*" in actions or "iam:*" in actions:
                        self.add_finding(ScanFinding(
                            rule_id="IAM-003",
                            title=f"IAM User '{username}' Has Wildcard Action in Inline Policy",
                            description=(
                                f"User '{username}' has an inline policy '{policy_name}' "
                                "with a wildcard action (*). This grants excessive permissions."
                            ),
                            severity=Severity.HIGH,
                            service="iam",
                            resource_id=user["Arn"],
                            resource_type="iam_user",
                            resource_name=username,
                            region="global",
                            recommendation="Replace wildcard actions with specific, minimal permissions.",
                            remediation_cmd=f"# Review and update inline policy '{policy_name}' for user {username}",
                        ))
                        break
        except ClientError as e:
            logger.warning(f"Could not check permissions for {username}: {e}")

    # ─── Rule: IAM-004 ────────────────────────────────────────────────────
    def _check_old_access_keys(self, user: dict):
        username = user["UserName"]
        try:
            keys = self.iam.list_access_keys(UserName=username)
            for key in keys["AccessKeyMetadata"]:
                if key["Status"] != "Active":
                    continue
                age = datetime.now(timezone.utc) - key["CreateDate"]
                if age > timedelta(days=90):
                    days_old = age.days
                    self.add_finding(ScanFinding(
                        rule_id="IAM-004",
                        title=f"IAM Access Key for '{username}' Is {days_old} Days Old",
                        description=(
                            f"User '{username}' has an active access key (ID: {key['AccessKeyId']}) "
                            f"that was created {days_old} days ago. "
                            "Long-lived credentials increase the risk of exposure. "
                            "AWS best practices recommend rotating access keys every 90 days."
                        ),
                        severity=Severity.MEDIUM,
                        service="iam",
                        resource_id=user["Arn"],
                        resource_type="iam_user",
                        resource_name=username,
                        region="global",
                        recommendation="Rotate the access key and update all applications using it.",
                        remediation_cmd=(
                            f'aws iam create-access-key --user-name {username} && '
                            f'aws iam delete-access-key --user-name {username} --access-key-id {key["AccessKeyId"]}'
                        ),
                    ))
        except ClientError as e:
            logger.warning(f"Could not check access keys for {username}: {e}")

    # ─── Rule: IAM-005 ────────────────────────────────────────────────────
    def _check_inactive_user(self, user: dict):
        username = user["UserName"]
        last_used = user.get("PasswordLastUsed")
        created = user.get("CreateDate")

        if last_used is None and created:
            age = datetime.now(timezone.utc) - created
            if age > timedelta(days=90):
                self.add_finding(ScanFinding(
                    rule_id="IAM-005",
                    title=f"IAM User '{username}' Has Never Logged In ({age.days} days old)",
                    description=(
                        f"User '{username}' was created {age.days} days ago but has never logged in. "
                        "Inactive or unused accounts are a security risk — they may have active "
                        "credentials that could be compromised without detection."
                    ),
                    severity=Severity.LOW,
                    service="iam",
                    resource_id=user["Arn"],
                    resource_type="iam_user",
                    resource_name=username,
                    region="global",
                    recommendation="Disable or delete this user if it is no longer needed.",
                    remediation_cmd=f'aws iam delete-login-profile --user-name {username}',
                ))
        elif last_used:
            days_since = (datetime.now(timezone.utc) - last_used).days
            if days_since > 90:
                self.add_finding(ScanFinding(
                    rule_id="IAM-005",
                    title=f"IAM User '{username}' Inactive for {days_since} Days",
                    description=(
                        f"User '{username}' has not logged in for {days_since} days "
                        f"(last login: {last_used.strftime('%Y-%m-%d')}). "
                        "Dormant accounts with active credentials are a security liability."
                    ),
                    severity=Severity.LOW,
                    service="iam",
                    resource_id=user["Arn"],
                    resource_type="iam_user",
                    resource_name=username,
                    region="global",
                    recommendation="Review this user account. Disable if no longer active.",
                    remediation_cmd=f'aws iam delete-login-profile --user-name {username}',
                ))
