import sys
print("starting import trace")
try:
    import app.models
    print("imported models")
    from app.api.routes import account, auth, compliance, copilot, drift, findings, iac, inventory, remediation, scans, topology, users, ws
    print("imported routes")
    from app.config import settings
    print("imported settings")
    from app.database import Base, engine
    print("imported database")
    import app.main
    print("imported app.main")
except Exception as e:
    print(f"Exception: {e}")
