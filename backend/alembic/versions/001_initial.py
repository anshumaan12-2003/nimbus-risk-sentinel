"""Initial database schema

Revision ID: 001
Revises:
Create Date: 2024-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── scans table ────────────────────────────────────────────────────────
    op.create_table(
        'scans',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('status', sa.String(50), nullable=False, server_default='PENDING'),
        sa.Column('account_id', sa.String(255), nullable=True),
        sa.Column('region', sa.String(100), nullable=True),
        sa.Column('triggered_by', sa.String(255), server_default='manual'),
        sa.Column('total_findings', sa.String(10), server_default='0'),
        sa.Column('critical_count', sa.String(10), server_default='0'),
        sa.Column('high_count', sa.String(10), server_default='0'),
        sa.Column('medium_count', sa.String(10), server_default='0'),
        sa.Column('low_count', sa.String(10), server_default='0'),
        sa.Column('risk_score', sa.String(10), server_default='0'),
        sa.Column('error_message', sa.String(1000), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=True),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
    )

    # ── resources table ────────────────────────────────────────────────────
    op.create_table(
        'resources',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scan_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('scans.id'), nullable=False),
        sa.Column('resource_arn', sa.String(500), nullable=True),
        sa.Column('resource_id', sa.String(255), nullable=False),
        sa.Column('resource_type', sa.String(100), nullable=False),
        sa.Column('name', sa.String(255), nullable=True),
        sa.Column('region', sa.String(100), nullable=True),
        sa.Column('account_id', sa.String(255), nullable=True),
        sa.Column('tags', postgresql.JSON(), nullable=True),
        sa.Column('metadata', postgresql.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
    )

    # ── findings table ─────────────────────────────────────────────────────
    op.create_table(
        'findings',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('scan_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('scans.id'), nullable=False),
        sa.Column('resource_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('resources.id'), nullable=False),
        sa.Column('rule_id', sa.String(50), nullable=False),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('recommendation', sa.Text(), nullable=True),
        sa.Column('remediation_cmd', sa.Text(), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False),
        sa.Column('risk_score', sa.Integer(), server_default='0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='OPEN'),
        sa.Column('assigned_to', sa.String(255), nullable=True),
        sa.Column('service', sa.String(50), nullable=False),
        sa.Column('region', sa.String(100), nullable=True),
        sa.Column('resource_name', sa.String(255), nullable=True),
        sa.Column('detected_at', sa.DateTime(), nullable=True),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )

    # ── indexes ────────────────────────────────────────────────────────────
    op.create_index('ix_findings_scan_id', 'findings', ['scan_id'])
    op.create_index('ix_findings_severity', 'findings', ['severity'])
    op.create_index('ix_findings_status', 'findings', ['status'])
    op.create_index('ix_findings_service', 'findings', ['service'])
    op.create_index('ix_scans_status', 'scans', ['status'])


def downgrade() -> None:
    op.drop_table('findings')
    op.drop_table('resources')
    op.drop_table('scans')
