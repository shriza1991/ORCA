"""field_observations

Revision ID: g1a2b3c4d5e8
Revises: f1a2b3c4d5e7
Create Date: 2026-10-04 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'g1a2b3c4d5e8'
down_revision: Union[str, None] = 'f1a2b3c4d5e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    observation_type_enum = postgresql.ENUM(
        'ROUGH_SEA', 'CALM_SEA', 'HIGH_WIND', 'LOW_VISIBILITY', 'JELLYFISH_BLOOM',
        'FISH_ACTIVITY', 'DEBRIS', 'OIL_SLICK', 'VESSEL_IN_DISTRESS', 'UNUSUAL_CURRENT',
        'ALGAL_BLOOM', 'RESTRICTED_AREA_ACTIVITY', 'OTHER',
        name='observationtypeenum',
        create_type=False
    )
    condition_severity_enum = postgresql.ENUM(
        'MILD', 'MODERATE', 'SEVERE', 'EXTREME',
        name='conditionseverityenum',
        create_type=False
    )
    location_precision_enum = postgresql.ENUM(
        'APPROXIMATE', 'EXACT',
        name='locationprecisionenum',
        create_type=False
    )
    contributor_trust_enum = postgresql.ENUM(
        'UNVERIFIED', 'PHONE_VERIFIED', 'ESTABLISHED',
        name='contributortrustenum',
        create_type=False
    )
    verification_status_enum = postgresql.ENUM(
        'UNVERIFIED', 'CORROBORATED', 'OFFICIAL_CONFIRMED', 'OFFICIAL_CONTRADICTED', 'EXPIRED',
        name='verificationstatusenum',
        create_type=False
    )

    bind = op.get_bind()
    observation_type_enum.create(bind, checkfirst=True)
    condition_severity_enum.create(bind, checkfirst=True)
    location_precision_enum.create(bind, checkfirst=True)
    contributor_trust_enum.create(bind, checkfirst=True)
    verification_status_enum.create(bind, checkfirst=True)

    op.create_table(
        'field_observations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('public_id', sa.String(), nullable=False),
        sa.Column('observation_type', observation_type_enum, nullable=False),
        sa.Column('severity', condition_severity_enum, nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('observed_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('valid_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('approx_latitude', sa.Float(), nullable=False),
        sa.Column('approx_longitude', sa.Float(), nullable=False),
        sa.Column('approx_radius_km', sa.Float(), nullable=False, server_default='5.0'),
        sa.Column('exact_latitude', sa.Float(), nullable=True),
        sa.Column('exact_longitude', sa.Float(), nullable=True),
        sa.Column('location_precision', location_precision_enum, nullable=False),
        sa.Column('harbor_reference', sa.String(), nullable=True),
        sa.Column('mission_context_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('contributor_trust', contributor_trust_enum, nullable=False),
        sa.Column('contributor_hash', sa.String(), nullable=True),
        sa.Column('verification_status', verification_status_enum, nullable=False),
        sa.Column('corroboration_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('official_agreement', sa.Boolean(), nullable=True),
        sa.Column('evidence_attachments_json', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('source_type', sa.String(), nullable=False, server_default='COMMUNITY'),
        sa.Column('data_mode', sa.String(), nullable=False, server_default='FIELD_SIGNAL'),
        sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_field_observations_public_id', 'field_observations', ['public_id'], unique=True)
    op.create_index('ix_field_observations_observation_type', 'field_observations', ['observation_type'])
    op.create_index('ix_field_observations_observed_at', 'field_observations', ['observed_at'])
    op.create_index('ix_field_observations_harbor_reference', 'field_observations', ['harbor_reference'])
    op.create_index('ix_field_observations_verification_status', 'field_observations', ['verification_status'])
    op.create_index('ix_field_observations_is_demo', 'field_observations', ['is_demo'])

    op.create_table(
        'observation_corroborations',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('primary_observation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('field_observations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('corroborating_observation_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('field_observations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index('ix_observation_corroborations_primary', 'observation_corroborations', ['primary_observation_id'])
    op.create_index('ix_observation_corroborations_corroborating', 'observation_corroborations', ['corroborating_observation_id'])


def downgrade() -> None:
    op.drop_table('observation_corroborations')
    op.drop_table('field_observations')
