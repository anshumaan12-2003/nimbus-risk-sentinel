"""
End-to-end pipeline test against a fake AWS account (moto) — no real AWS calls, no cost.

Builds a deliberately vulnerable account:
  internet -> EC2 (SSH open, IMDSv1) -> role with s3:* -> prod-customer-data bucket (crown jewel)
  internet -> IAM user without MFA + AdministratorAccess -> everything
  public RDS instance, DynamoDB table, RDS master secret
then runs the real scan task and asserts the API returns real, deduplicated, graph-linked data.

Run:  pytest tests/test_e2e_moto.py -q
"""
import json
import os

os.environ.update({
    "AWS_ACCESS_KEY_ID": "testing", "AWS_SECRET_ACCESS_KEY": "testing", "AWS_SESSION_TOKEN": "testing",
    "AWS_DEFAULT_REGION": "us-east-1", "AWS_REGIONS": "us-east-1,ap-south-1",
    "DATABASE_URL": "sqlite:///./test_e2e.db",
    "SLACK_ENABLED": "false", "MOTO_IAM_LOAD_MANAGED_POLICIES": "true", "AI_API_KEY": "", "REMEDIATION_ENABLED": "true",
    "SECRET_KEY": "test-secret-key-that-is-at-least-32-chars-long", "REMEDIATION_TWO_PERSON_RULE": "true",
    "SCHEDULED_SCANS_ENABLED": "false",   # tests trigger scans explicitly
})
for _k in ("AWS_PROFILE", "AWS_ROLE_ARN"):
    os.environ.pop(_k, None)

import boto3  # noqa: E402
import pytest  # noqa: E402
from moto import mock_aws  # noqa: E402

REGION = "us-east-1"


def _build_vulnerable_account():
    iam = boto3.client("iam", region_name=REGION)
    s3 = boto3.client("s3", region_name=REGION)
    ec2 = boto3.client("ec2", region_name=REGION)
    rds = boto3.client("rds", region_name=REGION)
    ddb = boto3.client("dynamodb", region_name=REGION)
    sm = boto3.client("secretsmanager", region_name=REGION)

    s3.create_bucket(Bucket="prod-customer-data")
    s3.create_bucket(Bucket="public-website-assets")
    s3.put_public_access_block(Bucket="public-website-assets", PublicAccessBlockConfiguration={
        "BlockPublicAcls": False, "IgnorePublicAcls": False, "BlockPublicPolicy": False, "RestrictPublicBuckets": False})
    s3.put_bucket_policy(Bucket="public-website-assets", Policy=json.dumps({"Version": "2012-10-17", "Statement": [
        {"Effect": "Allow", "Principal": "*", "Action": "s3:GetObject", "Resource": "arn:aws:s3:::public-website-assets/*"}]}))

    trust = {"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Principal": {"Service": "ec2.amazonaws.com"}, "Action": "sts:AssumeRole"}]}
    iam.create_role(RoleName="DataPipelineRole", AssumeRolePolicyDocument=json.dumps(trust))
    iam.put_role_policy(RoleName="DataPipelineRole", PolicyName="s3all", PolicyDocument=json.dumps({
        "Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "s3:*", "Resource": "*"}]}))
    iam.create_instance_profile(InstanceProfileName="DataPipelineProfile")
    iam.add_role_to_instance_profile(InstanceProfileName="DataPipelineProfile", RoleName="DataPipelineRole")

    iam.create_user(UserName="dev-intern")
    iam.create_login_profile(UserName="dev-intern", Password="Passw0rd!Passw0rd!")
    iam.attach_user_policy(UserName="dev-intern", PolicyArn="arn:aws:iam::aws:policy/AdministratorAccess")

    vpc = ec2.describe_vpcs()["Vpcs"][0]["VpcId"]
    sg = ec2.create_security_group(GroupName="web-ssh-open", Description="bad", VpcId=vpc)["GroupId"]
    ec2.authorize_security_group_ingress(GroupId=sg, IpPermissions=[
        {"IpProtocol": "tcp", "FromPort": 22, "ToPort": 22, "IpRanges": [{"CidrIp": "0.0.0.0/0"}]}])
    subnet = ec2.describe_subnets()["Subnets"][0]["SubnetId"]
    ec2.run_instances(
        ImageId="ami-12c6146b", MinCount=1, MaxCount=1, InstanceType="t3.micro",
        IamInstanceProfile={"Name": "DataPipelineProfile"},
        NetworkInterfaces=[{"DeviceIndex": 0, "SubnetId": subnet, "Groups": [sg], "AssociatePublicIpAddress": True}],
        TagSpecifications=[{"ResourceType": "instance", "Tags": [{"Key": "Name", "Value": "api-worker-01"}]}])

    rds.create_db_instance(DBInstanceIdentifier="billing-db", DBInstanceClass="db.t3.micro", Engine="postgres",
                           MasterUsername="postgres", MasterUserPassword="Passw0rd!Passw0rd!",
                           AllocatedStorage=20, PubliclyAccessible=True, VpcSecurityGroupIds=[sg])
    ddb.create_table(TableName="customers", KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
                     AttributeDefinitions=[{"AttributeName": "id", "AttributeType": "S"}], BillingMode="PAY_PER_REQUEST")
    db_arn = rds.describe_db_instances()["DBInstances"][0]["DBInstanceArn"]
    sm.create_secret(Name="rds!billing-db", SecretString="{}", Tags=[{"Key": "aws:rds:primaryDBInstanceArn", "Value": db_arn}])
    return sg


PASSWORD = "correct-horse-battery"
USERS = {  # role -> email; created straight in the DB by seed_users()
    "admin": "admin@nimbus.test", "approver": "approver@nimbus.test", "approver2": "approver2@nimbus.test",
    "engineer": "engineer@nimbus.test", "viewer": "viewer@nimbus.test",
}


def seed_users(password: str = PASSWORD, users: dict = USERS):
    from app.auth.security import hash_password
    from app.database import SessionLocal
    from app.models.user import Role, User
    db = SessionLocal()
    h = hash_password(password)
    for key, email in users.items():
        if not db.query(User).filter(User.email == email).first():
            db.add(User(email=email, name=key.title(), role=Role(key.rstrip("0123456789")), password_hash=h))
    db.commit()
    db.close()


def login(c, who: str):
    """Sign in as a seeded user; subsequent calls on this client carry their bearer token."""
    r = c.post("/api/v1/auth/login", json={"email": USERS[who], "password": PASSWORD})
    assert r.status_code == 200, r.text
    c.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    return r.json()


@pytest.fixture()
def client():
    from app.database import Base, engine
    import app.models  # noqa: F401
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with mock_aws():
        sg = _build_vulnerable_account()
        from app.utils.aws_client import reset_sessions
        reset_sessions()
        from fastapi.testclient import TestClient
        from app.main import app
        from app.api.routes import auth as auth_routes
        auth_routes._failed_logins._hits.clear()
        seed_users()
        with TestClient(app) as c:
            c.sg = sg
            login(c, "admin")
            yield c


def _scan(client):
    r = client.post("/api/v1/scans/trigger", json={})
    assert r.status_code == 202, r.text
    # TestClient runs BackgroundTasks synchronously after the response
    scan = client.get(f"/api/v1/scans/{r.json()['id']}").json()
    assert scan["status"] == "COMPLETED", scan
    return scan


def test_full_pipeline(client):
    pre = client.get("/api/v1/account/preflight").json()
    assert pre["connected"] and pre["account_id"]

    scan = _scan(client)
    findings = client.get("/api/v1/findings").json()
    rules = {f["rule_id"] for f in findings}
    assert {"IAM-002", "IAM-003", "EC2-001", "EC2-005", "RDS-001"} <= rules, rules
    # IAM is global: must not be duplicated per region
    keys = [(f["rule_id"], f["resource_id"]) for f in findings]
    assert len(keys) == len(set(keys))
    # resource_id is the AWS id now, not a DB UUID
    assert any(f["resource_id"] == client.sg for f in findings)

    stats = client.get("/api/v1/findings/stats").json()
    assert stats["total"] == len(findings) and stats["risk_score"] == int(scan["risk_score"])
    # per-service breakdown (dashboard) adds up to the open findings
    assert sum(stats["by_service"].values()) == stats["total"] - stats["resolved"]
    assert {"iam", "ec2", "rds"} <= set(stats["by_service"])

    env = client.get("/api/v1/topology/environment").json()
    ids = {n["id"] for n in env["nodes"]}
    kinds = {n["kind"] for n in env["nodes"]}
    assert "internet" in ids and "EC2" in kinds and "IAM Role" in kinds
    crowns = {n["short"] for n in env["nodes"] if n.get("crown")}
    assert "prod-customer-data" in crowns and "billing-db" in crowns
    techniques = " | ".join(e["technique"] for e in env["edges"])
    assert "0.0.0.0/0" in techniques and "IMDSv1" in techniques and "No MFA" in techniques
    assert any(e.get("findingId") for e in env["edges"])  # edges link to real findings

    graph = client.get("/api/v1/topology/graph").json()
    br = client.get("/api/v1/topology/blast-radius/internet").json()
    assert graph["nodes"] and br["crown_jewels_at_risk"] >= 2

    comp = client.get("/api/v1/compliance").json()
    cis = next(c for c in comp if c["id"].startswith("cis"))
    assert cis["failingRules"] >= 3 and 0 < cis["score"] < 100

    # second scan: nothing changed -> no new drift, first-seen date preserved
    _scan(client)
    drift = client.get("/api/v1/drift/latest").json()
    assert drift["summary"]["new_count"] == 0, drift["summary"]


def test_remediation_requires_a_second_person(client):
    _scan(client)
    f = next(x for x in client.get("/api/v1/findings").json() if x["rule_id"] == "EC2-001")

    login(client, "viewer")
    assert client.post("/api/v1/remediation/dry-run", json={"finding_id": f["id"]}).status_code == 403

    login(client, "engineer")
    dr = client.post("/api/v1/remediation/dry-run", json={"finding_id": f["id"]}).json()
    assert dr["supported"] and dr["dry_run"]["before_state"]["world_open_rules"]
    req = client.post("/api/v1/remediation/requests", json={"finding_id": f["id"], "justification": "SSH open to world"})
    assert req.status_code == 201, req.text
    req = req.json()
    assert req["status"] == "PENDING" and req["requested_by"] == USERS["engineer"]
    # duplicate pending request is refused; engineers cannot approve
    assert client.post("/api/v1/remediation/requests", json={"finding_id": f["id"]}).status_code == 409
    assert client.post(f"/api/v1/remediation/requests/{req['id']}/approve").status_code == 403
    # the old one-click endpoint is gone
    assert client.post("/api/v1/remediation/apply", json={"finding_id": f["id"]}).status_code in (404, 405)
    # nothing changed in AWS yet
    sg = boto3.client("ec2", region_name=REGION).describe_security_groups(GroupIds=[client.sg])["SecurityGroups"][0]
    assert any(r.get("CidrIp") == "0.0.0.0/0" for p in sg["IpPermissions"] for r in p.get("IpRanges", []))

    login(client, "approver")
    ok = client.post(f"/api/v1/remediation/requests/{req['id']}/approve", json={"note": "lgtm"})
    assert ok.status_code == 200, ok.text
    assert ok.json()["request"]["status"] == "APPLIED"
    sg = boto3.client("ec2", region_name=REGION).describe_security_groups(GroupIds=[client.sg])["SecurityGroups"][0]
    assert not any(r.get("CidrIp") == "0.0.0.0/0" for p in sg["IpPermissions"] for r in p.get("IpRanges", []))
    audit = client.get("/api/v1/remediation/audit-trail").json()[0]
    assert audit["status"] == "VERIFIED_RESOLVED"
    assert audit["executed_by"] == USERS["approver"] and audit["requested_by"] == USERS["engineer"]
    # approved requests cannot be approved twice
    assert client.post(f"/api/v1/remediation/requests/{req['id']}/approve").status_code == 409

    # an approver cannot approve their OWN request (four-eyes)
    ec5 = next(x for x in client.get("/api/v1/findings").json() if x["rule_id"] == "EC2-005")
    own = client.post("/api/v1/remediation/requests", json={"finding_id": ec5["id"]}).json()
    r = client.post(f"/api/v1/remediation/requests/{own['id']}/approve")
    assert r.status_code == 403 and "Four-eyes" in r.json()["detail"]
    # reject needs a reason; another approver rejects it
    login(client, "approver2")
    assert client.post(f"/api/v1/remediation/requests/{own['id']}/reject", json={}).status_code == 422
    rej = client.post(f"/api/v1/remediation/requests/{own['id']}/reject", json={"note": "maintenance window first"}).json()
    assert rej["status"] == "REJECTED" and rej["decided_by"] == USERS["approver2"]

    # manual-only rules cannot be requested
    login(client, "engineer")
    manual = next(x for x in client.get("/api/v1/findings").json() if x["rule_id"] == "IAM-002")
    assert client.post("/api/v1/remediation/dry-run", json={"finding_id": manual["id"]}).json()["supported"] is False
    assert client.post("/api/v1/remediation/requests", json={"finding_id": manual["id"]}).status_code == 400


def test_inventory_and_config(client):
    _scan(client)
    inv = client.get("/api/v1/inventory").json()
    types = inv["summary"]["by_type"]
    assert types.get("ec2") == 1 and types.get("rds") == 1 and types.get("iam_role", 0) >= 1
    ec2 = next(a for a in inv["assets"] if a["type"] == "ec2")
    assert ec2["public"] and "22" in ec2["details"]["open_ports"]
    assert any(a["findings"] for a in inv["assets"])
    assert client.get("/api/v1/inventory?type=rds").json()["assets"][0]["crown"] is True
    cfg = client.get("/api/v1/account/config").json()
    assert cfg["regions"] == ["us-east-1", "ap-south-1"] and "AI_API_KEY" not in str(cfg)


def test_scan_progress_grid(client):
    scan = _scan(client)
    detail = client.get(f"/api/v1/scans/{scan['id']}").json()
    prog = client.get(f"/api/v1/scans/{scan['id']}/progress").json()
    assert detail["progress"]["stage"] == prog["stage"] == "completed" and prog["percent"] == 100
    assert prog["regions"] == ["ap-south-1", "us-east-1"]
    cells = {(t["phase"], t["service"], t["region"]) for t in prog["tasks"]}
    for region in ("us-east-1", "ap-south-1"):
        for svc in ("ec2", "rds", "lambda", "dynamodb", "secretsmanager"):
            assert ("inventory", svc, region) in cells
        assert ("checks", "ec2", region) in cells and ("checks", "rds", region) in cells
    assert ("checks", "iam", "global") in cells and ("inventory", "s3", "global") in cells
    assert all(t["status"] in ("done", "partial") for t in prog["tasks"]), [t for t in prog["tasks"] if t["status"] not in ("done", "partial")]
    assert all(t["duration_ms"] is not None for t in prog["tasks"])
    ec2 = next(t for t in prog["tasks"] if t["id"] == "checks:ec2:us-east-1")
    assert ec2["findings"] >= 2          # EC2-001 + EC2-005 on the vulnerable instance
    assert prog["totals"]["findings"] >= int(scan["total_findings"])
    assert detail["triggered_by"] == USERS["admin"]   # the real user, not "api"
    assert "progress" not in client.get("/api/v1/scans").json()[0]   # list stays light


def test_copilot_chat_grounded_fallback(client):
    assert "no completed scan" in client.post("/api/v1/copilot/chat", json={"question": "hi"}).json()["answer"].lower()
    _scan(client)
    r = client.post("/api/v1/copilot/chat", json={"question": "what should I fix first?"}).json()
    assert r["ai"] is False and "Fix first" in r["answer"] and "123456789012" in r["answer"]


def test_temporary_credentials_and_scheduler(client, monkeypatch):
    # The fake env uses AWS_SESSION_TOKEN, so preflight passing proves temporary keys are honoured
    pre = client.get("/api/v1/account/preflight").json()
    assert pre["connected"] and pre["auth_mode"] == "temporary-keys"

    from datetime import timedelta
    from app.config import settings
    from app.tasks import scheduler
    hour = timedelta(minutes=60)
    assert scheduler._seconds_until_due(hour) == 0          # no scans yet: first one is due now
    _scan(client)
    assert 3500 < scheduler._seconds_until_due(hour) <= 3600  # next one an interval after the last start

    assert scheduler.enabled() is False                       # tests turn it off
    monkeypatch.setattr(settings, "SCHEDULED_SCANS_ENABLED", True)
    assert scheduler.enabled() is True
    monkeypatch.setattr(settings, "SCAN_EXECUTOR", "celery")  # beat owns scheduling then
    assert scheduler.enabled() is False
    assert client.get("/api/v1/account/config").json()["scheduled_scans"] is True
