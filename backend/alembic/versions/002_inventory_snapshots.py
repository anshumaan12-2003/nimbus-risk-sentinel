"""inventory snapshots + indexes for latest-scan queries

Revision ID: 002
Revises: 001
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # idempotent: the dev SQLite path may already have created the table via create_all()
    insp = sa.inspect(op.get_bind())
    if "inventory_snapshots" in insp.get_table_names():
        return
    op.create_table(
        "inventory_snapshots",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("scans.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("warnings", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index("ix_inventory_snapshots_scan_id", "inventory_snapshots", ["scan_id"])
    existing = {i["name"] for i in insp.get_indexes("findings")} | {i["name"] for i in insp.get_indexes("scans")}
    if "ix_findings_scan_id" not in existing:
        op.create_index("ix_findings_scan_id", "findings", ["scan_id"])
    if "ix_scans_status_started" not in existing:
        op.create_index("ix_scans_status_started", "scans", ["status", "started_at"])


def downgrade() -> None:
    op.drop_index("ix_scans_status_started", table_name="scans")
    op.drop_index("ix_findings_scan_id", table_name="findings")
    op.drop_index("ix_inventory_snapshots_scan_id", table_name="inventory_snapshots")
    op.drop_table("inventory_snapshots")
