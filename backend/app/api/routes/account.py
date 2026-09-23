"""
Preflight: "what can Nimbus actually see in this account?"
Calls each read API the scanners depend on once and reports OK / AccessDenied, so a blank
dashboard is explained instead of silently empty.
"""
from botocore.exceptions import BotoCoreError, ClientError, NoCredentialsError
from fastapi import APIRouter

from app.config import settings
from app.utils.aws_client import get_aws_client, reset_sessions

router = APIRouter(prefix="/account", tags=["Account"])

PROBES = [
    ("iam", "GetAccountAuthorizationDetails", lambda c: c.get_account_authorization_details(MaxItems=1)),
    ("iam", "GetAccountSummary", lambda c: c.get_account_summary()),
    ("iam", "GenerateCredentialReport", lambda c: c.generate_credential_report()),
    ("s3", "ListBuckets", lambda c: c.list_buckets()),
    ("ec2", "DescribeInstances", lambda c: c.describe_instances(MaxResults=5)),
    ("ec2", "DescribeSecurityGroups", lambda c: c.describe_security_groups(MaxResults=5)),
    ("ec2", "DescribeVolumes", lambda c: c.describe_volumes(MaxResults=5)),
    ("rds", "DescribeDBInstances", lambda c: c.describe_db_instances(MaxRecords=20)),
    ("lambda", "ListFunctions", lambda c: c.list_functions(MaxItems=1)),
    ("dynamodb", "ListTables", lambda c: c.list_tables(Limit=1)),
    ("secretsmanager", "ListSecrets", lambda c: c.list_secrets(MaxResults=1)),
]


@router.get("/preflight")
def preflight(refresh: bool = False):
    if refresh:
        reset_sessions()
    try:
        ident = get_aws_client("sts").get_caller_identity()
    except (NoCredentialsError, ClientError, BotoCoreError) as e:
        return {"connected": False, "error": str(e),
                "hint": "Set AWS_PROFILE (recommended) or AWS_ROLE_ARN / keys in backend/.env, then restart."}

    checks = []
    for region in settings.aws_regions_list:
        for service, call, fn in PROBES:
            if service in ("iam", "s3") and region != settings.aws_regions_list[0]:
                continue  # global services: probe once
            try:
                fn(get_aws_client(service, region))
                checks.append({"service": service, "call": call, "region": region, "ok": True})
            except ClientError as e:
                checks.append({"service": service, "call": call, "region": region, "ok": False,
                               "error": e.response.get("Error", {}).get("Code")})
            except BotoCoreError as e:
                checks.append({"service": service, "call": call, "region": region, "ok": False, "error": type(e).__name__})
    failing = [c for c in checks if not c["ok"]]
    return {
        "connected": True,
        "account_id": ident["Account"],
        "principal_arn": ident["Arn"],
        "regions": settings.aws_regions_list,
        "auth_mode": "assume-role" if settings.AWS_ROLE_ARN else "profile" if settings.AWS_PROFILE
                     else "static-keys" if settings.AWS_ACCESS_KEY_ID else "default-chain",
        "remediation_enabled": settings.REMEDIATION_ENABLED,
        "checks": checks,
        "ready": not failing,
        "hint": None if not failing else "Attach the AWS managed policies SecurityAudit + ViewOnlyAccess to the scanner identity.",
    }


@router.get("/config")
def get_config():
    """Non-secret runtime configuration, for the Settings page."""
    return {
        "app_version": settings.APP_VERSION,
        "regions": settings.aws_regions_list,
        "default_region": settings.AWS_DEFAULT_REGION,
        "auth_mode": "assume-role" if settings.AWS_ROLE_ARN else "profile" if settings.AWS_PROFILE
                     else "static-keys" if settings.AWS_ACCESS_KEY_ID else "default-chain",
        "profile": settings.AWS_PROFILE,
        "role_arn": settings.AWS_ROLE_ARN,
        "scan_executor": settings.SCAN_EXECUTOR,
        "scan_interval_minutes": int(settings.SCAN_INTERVAL_MINUTES),
        "events_backend": settings.EVENTS_BACKEND,
        "remediation_enabled": settings.REMEDIATION_ENABLED,
        "remediation_role_arn": settings.AWS_REMEDIATION_ROLE_ARN,
        "ai_provider": settings.AI_PROVIDER,
        "ai_model": settings.AI_MODEL,
        "ai_configured": bool(settings.AI_API_KEY),
        "slack_enabled": bool(settings.SLACK_ENABLED) and bool(settings.SLACK_WEBHOOK_URL),
        "crown_jewel_tag_keys": settings.crown_tag_keys,
        "crown_jewel_name_hints": settings.crown_name_hints,
    }
