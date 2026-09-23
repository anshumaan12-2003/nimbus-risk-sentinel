"""Auth + RBAC: sessions, rotation, lockout, revocation, role gates, user admin guard rails."""

import pytest

import tests.test_e2e_moto as base  # noqa: F401  (sets env vars before the app is imported)
from tests.test_e2e_moto import PASSWORD, USERS, login, seed_users


@pytest.fixture()
def api():
    from fastapi.testclient import TestClient

    import app.models  # noqa: F401
    from app.api.routes import auth as auth_routes
    from app.database import Base, engine
    from app.main import app
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    auth_routes._failed_logins._hits.clear()
    with TestClient(app) as c:
        yield c


def test_first_run_setup_then_locked(api):
    assert api.get("/api/v1/auth/status").json()["setup_required"] is True
    short = api.post("/api/v1/auth/setup", json={"email": "me@x.io", "name": "Me", "password": "short"})
    assert short.status_code == 422
    r = api.post("/api/v1/auth/setup", json={"email": "Me@X.io ", "name": "Me", "password": PASSWORD})
    assert r.status_code == 201 and r.json()["user"]["role"] == "admin" and r.json()["user"]["email"] == "me@x.io"
    assert api.get("/api/v1/auth/status").json()["setup_required"] is False
    again = api.post("/api/v1/auth/setup", json={"email": "evil@x.io", "name": "E", "password": PASSWORD})
    assert again.status_code == 409


def test_everything_requires_a_session(api):
    seed_users()
    for path in ("/api/v1/findings", "/api/v1/scans", "/api/v1/inventory", "/api/v1/account/config", "/api/v1/users"):
        assert api.get(path).status_code == 401, path
    assert api.get("/health").status_code == 200
    with pytest.raises(Exception):
        with api.websocket_connect("/ws/events") as ws:
            ws.receive_text()
    tok = login(api, "viewer")["access_token"]
    with api.websocket_connect(f"/ws/events?token={tok}"):
        pass   # accepted
    assert api.get("/api/v1/findings").status_code == 200
    api.headers["Authorization"] = "Bearer not-a-jwt"
    assert api.get("/api/v1/findings").status_code == 401


def test_role_gates(api):
    seed_users()
    login(api, "viewer")
    assert api.post("/api/v1/scans/trigger", json={}).status_code == 403
    assert "engineer" in api.post("/api/v1/scans/trigger", json={}).json()["detail"]
    assert api.post("/api/v1/users", json={"email": "a@b.c", "name": "A"}).status_code == 403
    login(api, "engineer")
    assert api.post("/api/v1/users", json={"email": "a@b.c", "name": "A"}).status_code == 403
    assert api.post("/api/v1/iac/scan/directory", json={"path": "/etc"}).status_code == 403
    assert api.post("/api/v1/drift/webhook/test", json={"webhook_url": "http://169.254.169.254/"}).status_code == 403
    login(api, "admin")
    ssrf = api.post("/api/v1/drift/webhook/test", json={"webhook_url": "http://169.254.169.254/latest/meta-data"})
    assert ssrf.status_code == 422


def test_refresh_rotation_and_reuse_detection(api, monkeypatch):
    from app.config import settings
    seed_users()
    # two tabs refreshing with the same cookie inside the grace window both succeed
    login(api, "viewer")
    shared = api.cookies.get("nimbus_rt")
    assert api.post("/api/v1/auth/refresh").status_code == 200
    api.cookies.clear()
    api.cookies.set("nimbus_rt", shared, path="/api/v1/auth")
    assert api.post("/api/v1/auth/refresh").status_code == 200
    # outside the grace window, replaying a rotated token is treated as theft
    monkeypatch.setattr(settings, "REFRESH_REUSE_GRACE_SECONDS", 0)
    api.cookies.clear()
    login(api, "engineer")
    first = api.cookies.get("nimbus_rt")
    assert first
    r1 = api.post("/api/v1/auth/refresh")
    assert r1.status_code == 200 and api.cookies.get("nimbus_rt") != first
    second = api.cookies.get("nimbus_rt")
    # an attacker replays the first (already rotated) cookie -> the whole family is revoked
    api.cookies.clear()
    api.cookies.set("nimbus_rt", first, path="/api/v1/auth")
    assert api.post("/api/v1/auth/refresh").status_code == 401
    api.cookies.clear()
    api.cookies.set("nimbus_rt", second, path="/api/v1/auth")
    assert api.post("/api/v1/auth/refresh").status_code == 401   # legit browser is signed out too
    # logout revokes the session server-side
    login(api, "engineer")
    api.post("/api/v1/auth/logout")
    assert api.post("/api/v1/auth/refresh").status_code == 401


def test_login_lockout_and_generic_errors(api):
    seed_users()
    bad = {"email": USERS["viewer"], "password": "wrong-password-123"}
    unknown = api.post("/api/v1/auth/login", json={"email": "nobody@x.io", "password": "wrong-password-123"})
    assert unknown.status_code == 401 and unknown.json()["detail"] == api.post("/api/v1/auth/login", json=bad).json()["detail"]
    for _ in range(4):
        api.post("/api/v1/auth/login", json=bad)
    locked = api.post("/api/v1/auth/login", json={"email": USERS["viewer"], "password": PASSWORD})
    assert locked.status_code == 429   # even the right password waits out the lockout


def test_role_change_and_deactivation_apply_immediately(api):
    seed_users()
    eng = login(api, "engineer")
    eng_token = eng["access_token"]
    login(api, "admin")
    users = {u["email"]: u for u in api.get("/api/v1/users").json()}
    uid = users[USERS["engineer"]]["id"]
    assert api.patch(f"/api/v1/users/{uid}", json={"role": "viewer"}).json()["role"] == "viewer"
    api.headers["Authorization"] = f"Bearer {eng_token}"
    assert api.get("/api/v1/findings").status_code == 401   # old token died with the role change
    login(api, "admin")
    api.patch(f"/api/v1/users/{uid}", json={"is_active": False})
    assert api.post("/api/v1/auth/login", json={"email": USERS["engineer"], "password": PASSWORD}).status_code == 401


def test_admin_guard_rails_and_temp_passwords(api):
    seed_users()
    me = login(api, "admin")["user"]
    assert api.patch(f"/api/v1/users/{me['id']}", json={"role": "viewer"}).status_code == 400
    assert api.patch(f"/api/v1/users/{me['id']}", json={"is_active": False}).status_code == 400
    created = api.post("/api/v1/users", json={"email": "new@nimbus.test", "name": "New", "role": "engineer"}).json()
    temp = created["temporary_password"]
    assert temp and created["user"]["role"] == "engineer"
    assert api.post("/api/v1/users", json={"email": "NEW@nimbus.test", "name": "Dup"}).status_code == 409
    r = api.post("/api/v1/auth/login", json={"email": "new@nimbus.test", "password": temp})
    assert r.status_code == 200
    api.headers["Authorization"] = f"Bearer {r.json()['access_token']}"
    ch = api.post("/api/v1/auth/change-password", json={"current_password": temp, "new_password": "a-brand-new-password"})
    assert ch.status_code == 200
    assert api.post("/api/v1/auth/login", json={"email": "new@nimbus.test", "password": temp}).status_code == 401
