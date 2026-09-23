import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

import app.models  # noqa: F401 — register models
from app.api.routes import (account, auth, compliance, copilot, drift, findings, iac, inventory, remediation,
                            scans, topology, users, ws)
from app.auth.deps import viewer
from app.auth.security import check_secret_key
from app.config import settings
from app.database import Base, engine
from app.utils.events import bus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
check_secret_key()   # refuse to start with a guessable JWT key unless DEBUG=true


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Postgres: schema is owned by Alembic (`alembic upgrade head`).
    # SQLite dev DB: create any missing tables so a fresh clone just works.
    if engine.url.get_backend_name() == "sqlite":
        Base.metadata.create_all(bind=engine)
    await bus.start()
    yield
    await bus.stop()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Nimbus Risk Sentinel — CSPM: scans AWS, builds attack paths, scores compliance, remediates safely.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public: sign-in only. Everything else requires a valid session (viewer = any signed-in user);
# stricter roles are enforced per endpoint (engineer: scans/triage, approver: apply fixes, admin: users).
app.include_router(auth.router, prefix="/api/v1")
for r in (scans, findings, drift, remediation, topology, iac, copilot, compliance, account, inventory, users):
    app.include_router(r.router, prefix="/api/v1", dependencies=[Depends(viewer)])
app.include_router(ws.router)  # /ws/events (+ legacy /api/v1/ws/telemetry)


@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "healthy", "app": settings.APP_NAME, "version": settings.APP_VERSION}


@app.get("/", tags=["Root"])
def root():
    return {"message": "Nimbus Risk Sentinel API", "docs": "/docs", "health": "/health"}
