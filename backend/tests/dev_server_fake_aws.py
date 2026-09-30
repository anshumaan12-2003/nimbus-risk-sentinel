"""
Run the real API against a FAKE vulnerable AWS account (moto) — for UI development, demos and
the Playwright suite, without touching real AWS.

    python tests/dev_server_fake_aws.py          ->  http://127.0.0.1:8000

Seeds one user per role (password: breachpath-demo-password):
    admin@breachpath.local  approver@breachpath.local  engineer@breachpath.local  viewer@breachpath.local

FAKE_LATENCY=0.8 (default) makes each scan unit take a little time so the live progress grid is
visible; set FAKE_LATENCY=0 for instant scans.
"""
import os
import random
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
DB_URL = os.environ.get("DATABASE_URL", "sqlite:///./fake_aws_dev.db")
import test_e2e_moto as t  # noqa: E402  (sets fake env vars)
os.environ["DATABASE_URL"] = DB_URL   # the test module points at its own DB; keep ours
from moto import mock_aws  # noqa: E402

DEMO_PASSWORD = "breachpath-demo-password"
DEMO_USERS = {"admin": "admin@breachpath.local", "approver": "approver@breachpath.local",
              "engineer": "engineer@breachpath.local", "viewer": "viewer@breachpath.local"}


def _add_latency(seconds: float):
    """Real accounts take seconds per API; moto answers in ms. Stretch each unit a bit."""
    if seconds <= 0:
        return
    from app.scanner.aws.ec2_scanner import EC2Scanner
    from app.scanner.aws.iam_scanner import IAMScanner
    from app.scanner.aws.rds_scanner import RDSScanner
    from app.scanner.aws.s3_scanner import S3Scanner
    from app.scanner.inventory import InventoryCollector

    def slow(fn):
        def wrapper(*a, **k):
            time.sleep(seconds * random.uniform(0.5, 2.0))
            return fn(*a, **k)
        return wrapper

    for cls in (EC2Scanner, IAMScanner, RDSScanner, S3Scanner):
        cls.scan = slow(cls.scan)
    for name in ("collect_iam", "collect_s3", "collect_ec2", "collect_rds", "collect_lambda",
                 "collect_dynamodb", "collect_secrets"):
        setattr(InventoryCollector, name, slow(getattr(InventoryCollector, name)))


if __name__ == "__main__":
    with mock_aws():
        # Same volume/instance ids every run: they appear in finding titles, so screenshot baselines need them stable
        from moto.moto_api._internal import mock_random
        mock_random.seed(42)
        t._build_vulnerable_account()
        import uvicorn
        from app.database import Base, engine
        import app.models  # noqa: F401
        Base.metadata.drop_all(bind=engine)
        Base.metadata.create_all(bind=engine)
        t.seed_users(DEMO_PASSWORD, DEMO_USERS)
        from app.tasks.scan_tasks import run_full_scan
        print(run_full_scan(triggered_by="seed"))
        print(run_full_scan(triggered_by="seed"))
        _add_latency(float(os.environ.get("FAKE_LATENCY", "0.8")))
        print(f"\nFake AWS API ready. Sign in with any of {', '.join(DEMO_USERS.values())} / {DEMO_PASSWORD}\n")
        uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("PORT", 8000)), log_level="warning")
