"""scan counters: VARCHAR -> INTEGER, so SQL sorts and sums them correctly ("9" > "10" as text)

Revision ID: 005
Revises: 004
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None

COLUMNS = ("total_findings", "critical_count", "high_count", "medium_count", "low_count", "risk_score")


def _alter(to_type, using: str) -> None:
    # batch mode rebuilds the table on SQLite (no ALTER COLUMN TYPE there) and is a plain ALTER on Postgres.
    # Postgres can't cast the old '0'::varchar default along with the column, so drop defaults first.
    with op.batch_alter_table("scans") as batch:
        for col in COLUMNS:
            batch.alter_column(col, server_default=None)
    with op.batch_alter_table("scans") as batch:
        for col in COLUMNS:
            batch.alter_column(col, type_=to_type, existing_nullable=True, nullable=False,
                               server_default="0", postgresql_using=using.format(col=col))


def upgrade() -> None:
    bind = op.get_bind()
    for col in COLUMNS:
        # old rows could hold NULL or '' (never non-numeric text); make both a clean 0 first
        bind.execute(sa.text(f"UPDATE scans SET {col} = '0' WHERE {col} IS NULL OR TRIM({col}) = ''"))
    _alter(sa.Integer(), "{col}::integer")


def downgrade() -> None:
    _alter(sa.String(10), "{col}::varchar")
