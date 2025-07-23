"""add workflow shares

Revision ID: add_workflow_shares
Revises: previous_revision
Create Date: 2024-03-19 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision = 'add_workflow_shares'
down_revision = None  # Update this to point to your last migration
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create workflow_shares table
    op.create_table(
        'workflow_shares',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('workflow_id', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('shared_by', sa.String(), nullable=False),
        sa.Column('shared_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['workflow_id'], ['workflows.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # Add index for faster lookups
    op.create_index(
        'ix_workflow_shares_workflow_id_user_id',
        'workflow_shares',
        ['workflow_id', 'user_id'],
        unique=True
    )


def downgrade() -> None:
    # Drop the index first
    op.drop_index('ix_workflow_shares_workflow_id_user_id')
    
    # Drop the table
    op.drop_table('workflow_shares') 