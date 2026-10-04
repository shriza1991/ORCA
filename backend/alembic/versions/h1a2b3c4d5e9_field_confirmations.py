"""Deduplicated anonymous field confirmations."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = "h1a2b3c4d5e9"
down_revision = "g1a2b3c4d5e8"
branch_labels = depends_on = None

def upgrade():
    op.create_table("field_confirmations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("observation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("field_observations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reporter_hash", sa.String(), nullable=False),
        sa.Column("agrees", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("observation_id", "reporter_hash", name="uq_field_confirmation_reporter"))

def downgrade():
    op.drop_table("field_confirmations")
