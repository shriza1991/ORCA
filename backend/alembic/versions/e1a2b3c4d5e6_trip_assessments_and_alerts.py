"""trip_assessments and actionable_alerts schema

Revision ID: e1a2b3c4d5e6
Revises: d2f13393badb
Create Date: 2026-09-23 18:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'e1a2b3c4d5e6'
down_revision: Union[str, None] = 'd2f13393badb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # saved_trip_subscriptions
    op.create_table(
        'saved_trip_subscriptions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('public_id', sa.String(), nullable=False),
        sa.Column('origin_harbor', sa.String(), nullable=False),
        sa.Column('craft_profile', sa.String(), nullable=False),
        sa.Column('departure_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('return_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('language', sa.String(), nullable=False, server_default='en'),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_saved_trip_subscriptions_public_id'), 'saved_trip_subscriptions', ['public_id'], unique=True)
    op.create_index(op.f('ix_saved_trip_subscriptions_origin_harbor'), 'saved_trip_subscriptions', ['origin_harbor'], unique=False)
    op.create_index(op.f('ix_saved_trip_subscriptions_is_active'), 'saved_trip_subscriptions', ['is_active'], unique=False)

    # actionable_alerts
    op.create_table(
        'actionable_alerts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('subscription_id', sa.UUID(), nullable=False),
        sa.Column('assessment_id', sa.String(), nullable=True),
        sa.Column('alert_type', sa.String(), nullable=False),
        sa.Column('severity', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('recommended_action', sa.String(), nullable=False),
        sa.Column('geometry_geojson', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('valid_from', sa.DateTime(timezone=True), nullable=True),
        sa.Column('valid_to', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='ACTIVE'),
        sa.Column('is_acknowledged', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('identity_hash', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['subscription_id'], ['saved_trip_subscriptions.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_actionable_alerts_subscription_id'), 'actionable_alerts', ['subscription_id'], unique=False)
    op.create_index(op.f('ix_actionable_alerts_status'), 'actionable_alerts', ['status'], unique=False)
    op.create_index(op.f('ix_actionable_alerts_identity_hash'), 'actionable_alerts', ['identity_hash'], unique=True)

    # trip_assessments
    op.create_table(
        'trip_assessments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('assessed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('origin_harbor', sa.String(), nullable=True),
        sa.Column('craft_profile', sa.String(), nullable=False),
        sa.Column('decision', sa.String(), nullable=False),
        sa.Column('evidence_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('is_durable', sa.Boolean(), nullable=False, server_default='true'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trip_assessments_origin_harbor'), 'trip_assessments', ['origin_harbor'], unique=False)
    op.create_index(op.f('ix_trip_assessments_decision'), 'trip_assessments', ['decision'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_trip_assessments_decision'), table_name='trip_assessments')
    op.drop_index(op.f('ix_trip_assessments_origin_harbor'), table_name='trip_assessments')
    op.drop_table('trip_assessments')

    op.drop_index(op.f('ix_actionable_alerts_identity_hash'), table_name='actionable_alerts')
    op.drop_index(op.f('ix_actionable_alerts_status'), table_name='actionable_alerts')
    op.drop_index(op.f('ix_actionable_alerts_subscription_id'), table_name='actionable_alerts')
    op.drop_table('actionable_alerts')

    op.drop_index(op.f('ix_saved_trip_subscriptions_is_active'), table_name='saved_trip_subscriptions')
    op.drop_index(op.f('ix_saved_trip_subscriptions_origin_harbor'), table_name='saved_trip_subscriptions')
    op.drop_index(op.f('ix_saved_trip_subscriptions_public_id'), table_name='saved_trip_subscriptions')
    op.drop_table('saved_trip_subscriptions')
