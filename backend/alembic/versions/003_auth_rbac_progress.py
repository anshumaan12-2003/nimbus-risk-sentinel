"""users + refresh sessions (auth), remediation approval requests, scan progress

Revision ID: 003
Revises: 002
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None

ROLE = sa.Enum("viewer", "engineer", "approver", "admin", name="user_role")
REQ = sa.Enum("PENDING", "APPLIED", "FAILED", "REJECTED", "CANCELLED", name="remediation_request_status")


def upgrade() -> None:
    # idempotent like 002: the SQLite dev path may already have these from create_all()
    bind = op.get_bind()
    insp = sa.inspect(bind)
    tables = set(insp.get_table_names())

    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("email", sa.String(320), nullable=False),
            sa.Column("name", sa.String(200), nullable=False),
            sa.Column("password_hash", sa.String(255), nullable=False),
            sa.Column("role", ROLE, nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("token_version", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("last_login_at", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "refresh_sessions" not in tables:
        op.create_table(
            "refresh_sessions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("family_id", sa.String(36), nullable=False),
            sa.Column("token_hash", sa.String(64), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
            sa.Column("revoked_at", sa.DateTime(timezone=True)),
            sa.Column("rotated_at", sa.DateTime(timezone=True)),
            sa.Column("user_agent", sa.String(300)),
        )
        op.create_index("ix_refresh_sessions_user_id", "refresh_sessions", ["user_id"])
        op.create_index("ix_refresh_sessions_family_id", "refresh_sessions", ["family_id"])
        op.create_index("ix_refresh_sessions_token_hash", "refresh_sessions", ["token_hash"], unique=True)

    if "remediation_requests" not in tables:
        op.create_table(
            "remediation_requests",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("finding_id", sa.String(36)),
            sa.Column("rule_id", sa.String(50), nullable=False),
            sa.Column("resource_id", sa.String(500), nullable=False),
            sa.Column("resource_name", sa.String(500)),
            sa.Column("region", sa.String(50)),
            sa.Column("severity", sa.String(20)),
            sa.Column("title", sa.String(500)),
            sa.Column("dry_run", sa.JSON(), nullable=False),
            sa.Column("justification", sa.Text()),
            sa.Column("status", REQ, nullable=False),
            sa.Column("requested_by_id", sa.String(36), nullable=False),
            sa.Column("requested_by", sa.String(320), nullable=False),
            sa.Column("decided_by_id", sa.String(36)),
            sa.Column("decided_by", sa.String(320)),
            sa.Column("decision_note", sa.Text()),
            sa.Column("result_message", sa.Text()),
            sa.Column("audit_log_id", sa.String(36)),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("decided_at", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_remediation_requests_status", "remediation_requests", ["status"])
        op.create_index("ix_remediation_requests_finding_id", "remediation_requests", ["finding_id"])

    if "audit_logs" not in tables:
        # 1.1 added the AuditLog model but no migration for it: SQLite dev DBs got it from create_all(),
        # Postgres (Docker Compose) never did. Create it here with the new columns included.
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("rule_id", sa.String(), nullable=False),
            sa.Column("resource_id", sa.String(), nullable=False),
            sa.Column("action_executed", sa.String(), nullable=False),
            sa.Column("executed_by", sa.String(), nullable=False),
            sa.Column("requested_by", sa.String()),
            sa.Column("request_id", sa.String(36)),
            sa.Column("status", sa.String(), nullable=False),
            sa.Column("result_message", sa.Text()),
            sa.Column("rollback_command", sa.JSON()),
            sa.Column("timestamp", sa.DateTime(timezone=True)),
        )
    else:
        audit_cols = {c["name"] for c in insp.get_columns("audit_logs")}
        with op.batch_alter_table("audit_logs") as b:   # batch mode: SQLite-safe ALTER
            if "requested_by" not in audit_cols:
                b.add_column(sa.Column("requested_by", sa.String()))
            if "request_id" not in audit_cols:
                b.add_column(sa.Column("request_id", sa.String(36)))

    scan_cols = {c["name"] for c in insp.get_columns("scans")}
    if "progress" not in scan_cols:
        with op.batch_alter_table("scans") as b:
            b.add_column(sa.Column("progress", sa.JSON()))


def downgrade() -> None:
    with op.batch_alter_table("scans") as b:
        b.drop_column("progress")
    with op.batch_alter_table("audit_logs") as b:
        b.drop_column("request_id")
        b.drop_column("requested_by")
    op.drop_table("remediation_requests")
    op.drop_table("refresh_sessions")
    op.drop_table("users")
    REQ.drop(op.get_bind(), checkfirst=True)
    ROLE.drop(op.get_bind(), checkfirst=True)
