"""The hosted demo (DEMO_MODE) shares one login, so people and passwords are read-only there."""
from app.config import settings
from tests.test_e2e_moto import USERS, PASSWORD, client  # noqa: F401  (client is a fixture)


def test_demo_mode_blocks_people_and_password_changes(client, monkeypatch):
    monkeypatch.setattr(settings, "DEMO_MODE", True)
    assert client.get("/api/v1/auth/status").json()["demo_mode"] is True
    me = client.get("/api/v1/users").json()
    other = next(u for u in me if u["email"] != USERS["admin"])
    assert client.post("/api/v1/users", json={"email": "x@example.com", "name": "X", "role": "viewer"}).status_code == 403
    assert client.patch(f"/api/v1/users/{other['id']}", json={"role": "viewer"}).status_code == 403
    assert client.post(f"/api/v1/users/{other['id']}/reset-password").status_code == 403
    r = client.post("/api/v1/auth/change-password", json={"current_password": PASSWORD, "new_password": "another-long-password-1"})
    assert r.status_code == 403 and "shared demo" in r.json()["detail"]
    # Reading still works
    assert client.get("/api/v1/findings").status_code == 200


def test_demo_mode_off_by_default(client):
    assert client.get("/api/v1/auth/status").json()["demo_mode"] is False
