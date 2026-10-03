"""trip_subscription_monitoring_context

Revision ID: f1a2b3c4d5e7
Revises: e1a2b3c4d5e6
Create Date: 2026-10-03 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e7'
down_revision: Union[str, None] = 'e1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('saved_trip_subscriptions', sa.Column('vessel_size', sa.String(), nullable=True, server_default='medium'))
    op.add_column('saved_trip_subscriptions', sa.Column('data_mode', sa.String(), nullable=True, server_default='LIVE'))
    op.add_column('saved_trip_subscriptions', sa.Column('mission_context_json', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('saved_trip_subscriptions', 'mission_context_json')
    op.drop_column('saved_trip_subscriptions', 'data_mode')
    op.drop_column('saved_trip_subscriptions', 'vessel_size')
