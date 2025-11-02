"""Initial database schema creation.

Revision ID: 001
Revises:
Create Date: 2025-11-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create Document table
    op.create_table(
        "document",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("filename", sa.String(), nullable=False),
        sa.Column("uploaded_by", sa.String(), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("upload_session_id", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.Index("ix_document_upload_session_id", "upload_session_id"),
    )

    # Create Requirement table
    op.create_table(
        "requirement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("doc_id", sa.Integer(), nullable=False),
        sa.Column("requirement_id", sa.String(), nullable=True),
        sa.Column("raw_text", sa.String(), nullable=False),
        sa.Column("structured", sa.String(), nullable=True),
        sa.Column("field_confidences", sa.String(), nullable=True),
        sa.Column("overall_confidence", sa.Float(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("error_message", sa.String(), nullable=True),
        sa.Column("embeddings_json", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["doc_id"], ["document.id"]),
        sa.Index("ix_requirement_doc_id", "doc_id"),
        sa.Index("ix_requirement_status", "status"),
    )

    # Create ReviewEvent table
    op.create_table(
        "reviewevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requirement_id", sa.Integer(), nullable=False),
        sa.Column("reviewer", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("diffs", sa.String(), nullable=True),
        sa.Column("reviewer_confidence", sa.Float(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["requirement_id"], ["requirement.id"]),
        sa.Index("ix_reviewevent_requirement_id", "requirement_id"),
    )

    # Create TestCase table
    op.create_table(
        "testcase",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requirement_id", sa.Integer(), nullable=False),
        sa.Column("test_case_id", sa.String(), nullable=False),
        sa.Column("gherkin", sa.String(), nullable=True),
        sa.Column("evidence_json", sa.String(), nullable=True),
        sa.Column("automated_steps_json", sa.String(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("jira_issue_key", sa.String(), nullable=True),
        sa.Column("sample_data_json", sa.String(), nullable=True),
        sa.Column("code_scaffold_str", sa.String(), nullable=True),
        sa.Column("test_type", sa.String(), nullable=False),
        sa.Column("regeneration_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["requirement_id"], ["requirement.id"]),
        sa.Index("ix_testcase_requirement_id", "requirement_id"),
        sa.Index("ix_testcase_status", "status"),
    )

    # Create GenerationEvent table
    op.create_table(
        "generationevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requirement_id", sa.Integer(), nullable=True),
        sa.Column("generated_by", sa.String(), nullable=False),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("prompt", sa.String(), nullable=True),
        sa.Column("raw_response", sa.String(), nullable=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("produced_testcase_ids", sa.String(), nullable=True),
        sa.Column("reviewer_confidence", sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["requirement_id"], ["requirement.id"]),
        sa.Index("ix_generationevent_requirement_id", "requirement_id"),
    )


def downgrade() -> None:
    op.drop_table("generationevent")
    op.drop_table("testcase")
    op.drop_table("reviewevent")
    op.drop_table("requirement")
    op.drop_table("document")
