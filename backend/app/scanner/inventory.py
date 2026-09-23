"""
Inventory collector — captures the *whole* account shape, not just misconfigured resources.

The rule scanners (S3/IAM/EC2/RDS) only emit failures. An attack graph needs the
relationships between healthy resources too (EC2 -> instance profile -> role -> bucket),
so this module snapshots everything the graph builder needs in one pass.

Every AWS call is wrapped: an AccessDenied on one API becomes a *warning* on the scan
instead of silently producing an empty dashboard.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Callable
from urllib.parse import unquote

from botocore.exceptions import BotoCoreError, ClientError

from app.utils.aws_client import get_aws_client

logger = logging.getLogger(__name__)

OPEN_CIDRS = {"0.0.0.0/0", "::/0"}


class InventoryCollector:
    def __init__(self, regions: list[str], home_region: str):
        self.regions = regions
        self.home_region = home_region
        self.warnings: list[dict] = []
        self._policy_cache: dict[str, list[dict]] = {}

    # ─── helpers ──────────────────────────────────────────────────────────
    def _safe(self, service: str, region: str, call: str, fn: Callable[[], Any], default: Any):
        try:
            return fn()
        except ClientError as e:
            code = e.response.get("Error", {}).get("Code", "ClientError")
            self.warnings.append({"service": service, "region": region, "call": call, "error": code})
            logger.warning("inventory %s:%s in %s failed: %s", service, call, region, code)
        except BotoCoreError as e:
            self.warnings.append({"service": service, "region": region, "call": call, "error": type(e).__name__})
        except Exception as e:  # malformed/unexpected response must never kill the whole scan
            self.warnings.append({"service": service, "region": region, "call": call, "error": f"{type(e).__name__}: {e}"[:200]})
            logger.exception("inventory %s:%s unexpected error", service, call)
        return default

    @staticmethod
    def _paginate(client, op: str, key: str, **kwargs) -> list:
        out = []
        for page in client.get_paginator(op).paginate(**kwargs):
            out.extend(page.get(key, []))
        return out

    @staticmethod
    def _doc(raw) -> dict:
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            return json.loads(unquote(raw))
        return {}

    @staticmethod
    def _statements(doc: dict) -> list[dict]:
        stmts = doc.get("Statement", [])
        return stmts if isinstance(stmts, list) else [stmts]

    # ─── IAM (global) ─────────────────────────────────────────────────────
    def _managed_policy_statements(self, iam, arn: str, known: dict) -> list[dict]:
        if arn in self._policy_cache:
            return self._policy_cache[arn]
        stmts: list[dict] = []
        if arn in known:
            stmts = known[arn]
        else:
            def fetch():
                pol = iam.get_policy(PolicyArn=arn)["Policy"]
                ver = iam.get_policy_version(PolicyArn=arn, VersionId=pol["DefaultVersionId"])
                return self._statements(self._doc(ver["PolicyVersion"]["Document"]))
            stmts = self._safe("iam", "global", "GetPolicyVersion", fetch, [])
        self._policy_cache[arn] = stmts
        return stmts

    def collect_iam(self) -> dict:
        iam = get_aws_client("iam", self.home_region)

        def details():
            out = {"UserDetailList": [], "RoleDetailList": [], "Policies": []}
            for page in iam.get_paginator("get_account_authorization_details").paginate(
                Filter=["User", "Role", "LocalManagedPolicy"]
            ):
                for k in out:
                    out[k].extend(page.get(k, []))
            return out

        d = self._safe("iam", "global", "GetAccountAuthorizationDetails", details, None)
        if d is None:
            return {"users": [], "roles": []}

        known: dict[str, list[dict]] = {}
        for p in d["Policies"]:
            for v in p.get("PolicyVersionList", []):
                if v.get("IsDefaultVersion"):
                    known[p["Arn"]] = self._statements(self._doc(v["Document"]))

        def principal_statements(entry: dict, inline_key: str) -> list[dict]:
            stmts: list[dict] = []
            for inline in entry.get(inline_key, []):
                stmts += self._statements(self._doc(inline.get("PolicyDocument")))
            for att in entry.get("AttachedManagedPolicies", []):
                stmts += self._managed_policy_statements(iam, att["PolicyArn"], known)
            return stmts

        users = [{
            "name": u["UserName"],
            "arn": u["Arn"],
            "statements": principal_statements(u, "UserPolicyList"),
            "groups": u.get("GroupList", []),
        } for u in d["UserDetailList"]]

        roles = []
        for r in d["RoleDetailList"]:
            if r.get("Path", "").startswith("/aws-service-role/"):
                continue  # AWS-managed service-linked roles are not attack surface we can fix
            roles.append({
                "name": r["RoleName"],
                "arn": r["Arn"],
                "trust": self._statements(self._doc(r.get("AssumeRolePolicyDocument"))),
                "statements": principal_statements(r, "RolePolicyList"),
                "instance_profiles": [ip["Arn"] for ip in r.get("InstanceProfileList", [])],
                "tags": {t["Key"]: t["Value"] for t in r.get("Tags", [])},
            })
        return {"users": users, "roles": roles}

    # ─── S3 (global list, per-bucket status) ──────────────────────────────
    def collect_s3(self) -> list[dict]:
        s3 = get_aws_client("s3", self.home_region)
        buckets = self._safe("s3", "global", "ListBuckets", lambda: s3.list_buckets().get("Buckets", []), [])
        out = []
        for b in buckets:
            name = b["Name"]

            def status():
                try:
                    return s3.get_bucket_policy_status(Bucket=name).get("PolicyStatus", {}).get("IsPublic", False)
                except ClientError as e:
                    if e.response["Error"]["Code"] in ("NoSuchBucketPolicy", "NoSuchBucket"):
                        return False
                    raise

            def tags():
                try:
                    return {t["Key"]: t["Value"] for t in s3.get_bucket_tagging(Bucket=name)["TagSet"]}
                except ClientError as e:
                    if e.response["Error"]["Code"] in ("NoSuchTagSet", "NoSuchBucket"):
                        return {}
                    raise

            out.append({
                "name": name,
                "arn": f"arn:aws:s3:::{name}",
                "public_policy": bool(self._safe("s3", "global", "GetBucketPolicyStatus", status, False)),
                "tags": self._safe("s3", "global", "GetBucketTagging", tags, {}),
            })
        return out

    # ─── Regional services ────────────────────────────────────────────────
    # ─── Regional services (one method each, so scan progress is per service x region) ──
    def collect_ec2(self, region: str) -> dict:
        ec2 = get_aws_client("ec2", region)
        sgs_raw = self._safe("ec2", region, "DescribeSecurityGroups",
                             lambda: self._paginate(ec2, "describe_security_groups", "SecurityGroups"), [])
        security_groups = {}
        for sg in sgs_raw:
            open_ports = []
            for perm in sg.get("IpPermissions", []):
                cidrs = {r.get("CidrIp") for r in perm.get("IpRanges", [])} | {r.get("CidrIpv6") for r in perm.get("Ipv6Ranges", [])}
                if cidrs & OPEN_CIDRS:
                    if perm.get("IpProtocol") == "-1":
                        open_ports.append("all")
                    else:
                        fp, tp = perm.get("FromPort"), perm.get("ToPort")
                        open_ports.append(str(fp) if fp == tp else f"{fp}-{tp}")
            security_groups[sg["GroupId"]] = {"name": sg.get("GroupName"), "open_ports": open_ports, "region": region}

        reservations = self._safe("ec2", region, "DescribeInstances",
                                  lambda: self._paginate(ec2, "describe_instances", "Reservations"), [])
        instances = []
        for res in reservations:
            for i in res.get("Instances", []):
                if i.get("State", {}).get("Name") == "terminated":
                    continue
                tags = {t["Key"]: t["Value"] for t in i.get("Tags", [])}
                instances.append({
                    "id": i["InstanceId"],
                    "region": region,
                    "name": tags.get("Name", i["InstanceId"]),
                    "public_ip": i.get("PublicIpAddress"),
                    "sg_ids": sorted({g["GroupId"] for g in i.get("SecurityGroups", [])} |
                                     {g["GroupId"] for ni in i.get("NetworkInterfaces", []) for g in ni.get("Groups", [])}),
                    "instance_profile_arn": (i.get("IamInstanceProfile") or {}).get("Arn"),
                    "imds_v1": (i.get("MetadataOptions") or {}).get("HttpTokens") != "required",
                    "state": i.get("State", {}).get("Name"),
                    "tags": tags,
                })
        return {"security_groups": security_groups, "ec2": instances}

    def collect_rds(self, region: str) -> dict:
        rds = get_aws_client("rds", region)
        dbs = self._safe("rds", region, "DescribeDBInstances",
                         lambda: self._paginate(rds, "describe_db_instances", "DBInstances"), [])
        return {"rds": [{
            "id": db["DBInstanceIdentifier"],
            "arn": db["DBInstanceArn"],
            "region": region,
            "engine": db.get("Engine"),
            "public": bool(db.get("PubliclyAccessible")),
            "sg_ids": [g["VpcSecurityGroupId"] for g in db.get("VpcSecurityGroups", [])],
            "tags": {t["Key"]: t["Value"] for t in db.get("TagList", [])},
        } for db in dbs]}

    def collect_lambda(self, region: str) -> dict:
        lam = get_aws_client("lambda", region)
        fns = self._safe("lambda", region, "ListFunctions",
                         lambda: self._paginate(lam, "list_functions", "Functions"), [])
        lambdas = []
        for fn in fns:
            def url_cfg(name=fn["FunctionName"]):
                cfgs = lam.list_function_url_configs(FunctionName=name).get("FunctionUrlConfigs", [])
                return any(c.get("AuthType") == "NONE" for c in cfgs)
            lambdas.append({
                "name": fn["FunctionName"],
                "arn": fn["FunctionArn"],
                "region": region,
                "role_arn": fn.get("Role"),
                "public_url": bool(self._safe("lambda", region, "ListFunctionUrlConfigs", url_cfg, False)),
            })
        return {"lambda": lambdas}

    def collect_dynamodb(self, region: str) -> dict:
        ddb = get_aws_client("dynamodb", region)
        tables = self._safe("dynamodb", region, "ListTables",
                            lambda: self._paginate(ddb, "list_tables", "TableNames"), [])
        # account id is filled in by assemble(); '*' keeps the ARN wildcard-matchable until then
        return {"dynamodb": [{"name": t, "arn": f"arn:aws:dynamodb:{region}:*:table/{t}", "region": region}
                             for t in tables]}

    def collect_secrets(self, region: str) -> dict:
        sm = get_aws_client("secretsmanager", region)
        secrets_raw = self._safe("secretsmanager", region, "ListSecrets",
                                 lambda: self._paginate(sm, "list_secrets", "SecretList"), [])
        return {"secrets": [{
            "name": s["Name"],
            "arn": s["ARN"],
            "region": region,
            "tags": {t["Key"]: t["Value"] for t in s.get("Tags", [])},
        } for s in secrets_raw]}

    REGIONAL = (("ec2", "collect_ec2"), ("rds", "collect_rds"), ("lambda", "collect_lambda"),
                ("dynamodb", "collect_dynamodb"), ("secretsmanager", "collect_secrets"))

    def collect_region(self, region: str) -> dict:
        out: dict[str, Any] = {"security_groups": {}, "ec2": [], "rds": [], "lambda": [], "dynamodb": [], "secrets": []}
        for _, method in self.REGIONAL:
            out.update(getattr(self, method)(region))
        return out

    # ─── Orchestration ────────────────────────────────────────────────────
    def units(self) -> list[tuple[str, str, Callable[[], dict]]]:
        """Independent units of work: (service, region, fn). The scan pipeline runs these in
        parallel and reports each one as a progress cell; region 'global' = account-wide."""
        out: list[tuple[str, str, Callable[[], dict]]] = [
            ("iam", "global", lambda: {"iam": self.collect_iam()}),
            ("s3", "global", lambda: {"s3": self.collect_s3()}),
        ]
        for region in self.regions:
            for service, method in self.REGIONAL:
                out.append((service, region, (lambda m=method, r=region: getattr(self, m)(r))))
        return out

    def assemble(self, account_id: str | None, parts: list[dict]) -> dict:
        data: dict[str, Any] = {
            "account_id": account_id,
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "regions": self.regions,
            "iam": {"users": [], "roles": []}, "s3": [],
            "security_groups": {},
            "ec2": [], "rds": [], "lambda": [], "dynamodb": [], "secrets": [],
        }
        for part in parts:
            if "iam" in part:
                data["iam"] = part["iam"]
            if "s3" in part:
                data["s3"] = part["s3"]
            data["security_groups"].update(part.get("security_groups", {}))
            for k in ("ec2", "rds", "lambda", "dynamodb", "secrets"):
                data[k].extend(part.get(k, []))
        if account_id:  # DynamoDB ListTables does not return ARNs
            for t in data["dynamodb"]:
                t["arn"] = t["arn"].replace(":*:table/", f":{account_id}:table/")
        data["counts"] = {k: len(data[k]) for k in ("ec2", "rds", "lambda", "dynamodb", "secrets", "s3")}
        data["counts"]["iam_roles"] = len(data["iam"]["roles"])
        data["counts"]["iam_users"] = len(data["iam"]["users"])
        return data

    def collect(self, account_id: str | None) -> dict:
        """Sequential collection (kept for scripts/tests); the scan pipeline uses units() in parallel."""
        return self.assemble(account_id, [fn() for _, _, fn in self.units()])
