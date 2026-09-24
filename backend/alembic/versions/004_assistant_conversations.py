"""Vesper assistant: saved conversations and messages

Revision ID: 004
Revises: 003
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # idempotent like 002/003: the SQLite dev path may already have these from create_all()
    tables = set(sa.inspect(op.get_bind()).get_table_names())

    if "assistant_conversations" not in tables:
        op.create_table(
            "assistant_conversations",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("title", sa.String(120), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.Column("updated_at", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_assistant_conversations_user_id", "assistant_conversations", ["user_id"])
        op.create_index("ix_assistant_conversations_updated_at", "assistant_conversations", ["updated_at"])

    if "assistant_messages" not in tables:
        op.create_table(
            "assistant_messages",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("conversation_id", sa.String(36),
                      sa.ForeignKey("assistant_conversations.id", ondelete="CASCADE"), nullable=False),
            sa.Column("role", sa.String(16), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.Column("citations", sa.JSON()),
            sa.Column("ai", sa.Boolean()),
            sa.Column("rating", sa.Integer()),
            sa.Column("created_at", sa.DateTime(timezone=True)),
        )
        op.create_index("ix_assistant_messages_conversation_id", "assistant_messages", ["conversation_id"])


def downgrade() -> None:
    op.drop_table("assistant_messages")
    op.drop_table("assistant_conversations")
