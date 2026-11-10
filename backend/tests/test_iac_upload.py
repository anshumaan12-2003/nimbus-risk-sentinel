"""IaC upload: client-chosen filenames and zip entries can't write outside the temp dir; size limits hold."""

import io
import os
import zipfile

import pytest

import tests.test_e2e_moto as base  # noqa: F401  (sets env vars before the app is imported)
from tests.test_e2e_moto import login, seed_users

TF = b'''resource "aws_security_group" "sg" {
  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }
}
'''


@pytest.fixture()
def api():
    from fastapi.testclient import TestClient

    import app.models  # noqa: F401
    from app.database import Base, engine
    from app.main import app
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as c:
        seed_users()
        login(c, "engineer")
        yield c


def _zip(entries: dict[str, bytes]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        for name, data in entries.items():
            z.writestr(name, data)
    return buf.getvalue()


def _upload(api, name, data):
    return api.post("/api/v1/iac/scan/upload", files={"file": (name, data, "application/octet-stream")})


def test_single_tf_file_is_scanned(api):
    r = _upload(api, "main.tf", TF)
    assert r.status_code == 200, r.text
    assert r.json()["total_findings"] >= 1


def test_traversal_in_filename_stays_in_temp_dir(api, tmp_path):
    escaped = tmp_path / "escaped.tf"
    r = _upload(api, f"../../../../../../{escaped}", TF)
    assert r.status_code == 200
    assert not escaped.exists()


def test_zip_with_nested_modules_is_scanned(api):
    r = _upload(api, "infra.zip", _zip({"modules/s3/main.tf": TF, "README.md": b"ignored"}))
    assert r.status_code == 200, r.text
    assert r.json()["total_findings"] >= 1


def test_zip_slip_is_refused(api, tmp_path):
    target = os.path.relpath(tmp_path / "slip.tf", "/tmp")
    r = _upload(api, "evil.zip", _zip({f"../../../../../../{target}": TF}))
    assert r.status_code in (200, 400)
    assert not (tmp_path / "slip.tf").exists()


def test_limits(api, monkeypatch):
    from app.api.routes import iac
    assert _upload(api, "notes.txt", b"x").status_code == 400
    assert _upload(api, "bad.zip", b"not a zip").status_code == 400
    monkeypatch.setattr(iac, "MAX_UPLOAD_BYTES", 10)
    assert _upload(api, "main.tf", TF).status_code == 413
    monkeypatch.setattr(iac, "MAX_UPLOAD_BYTES", 5_000_000)
    monkeypatch.setattr(iac, "MAX_UNZIPPED_BYTES", 10)
    assert _upload(api, "big.zip", _zip({"a.tf": TF})).status_code == 413
