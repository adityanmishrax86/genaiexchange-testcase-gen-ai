# src/models.py
from typing import Optional
from sqlmodel import SQLModel, Field
import datetime, uuid

def now_utc():
    return datetime.datetime.now(datetime.timezone.utc)

class Document(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    filename: str
    uploaded_by: Optional[str] = None
    uploaded_at: datetime.datetime = Field(default_factory=now_utc)
    version: int = 1
    upload_session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))

class Requirement(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    doc_id: int
    requirement_id: Optional[str] = None
    raw_text: str
    structured: Optional[str] = None  # JSON string
    field_confidences: Optional[str] = None  # JSON string { field: confidence }
    overall_confidence: float = 0.0
    status: str = "extracted"  # extracted | in_review | approved | needs_author
    created_at: datetime.datetime = Field(default_factory=now_utc)
    updated_at: datetime.datetime = Field(default_factory=now_utc)
    version: int = 1
    error_message: Optional[str] = Field(default=None)
    embeddings_json: Optional[str] = None  # JSON string with chunks and embeddings

class ReviewEvent(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_id: int
    reviewer: str
    action: str
    note: Optional[str] = None
    diffs: Optional[str] = None
    reviewer_confidence: Optional[float] = None
    timestamp: datetime.datetime = Field(default_factory=now_utc)

class TestCase(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_id: int
    test_case_id: str
    gherkin: Optional[str] = None
    evidence_json: Optional[str] = None
    automated_steps_json: Optional[str] = None
    generated_at: datetime.datetime = Field(default_factory=now_utc)
    status: str = "preview"  # preview | generated | stale | pushed
    jira_issue_key: Optional[str] = None
    sample_data_json: Optional[str] = Field(default=None)
    code_scaffold_str: Optional[str] = Field(default=None)
    test_type: str = Field(default="positive")
    regeneration_count: int = Field(default=0)

class GenerationEvent(SQLModel, table=True):
    """
    Audit for each generation call (preview or confirmed generation).
    Store model metadata, prompt, raw_response, produced_ids (list of test case ids).
    """
    id: Optional[int] = Field(default=None, primary_key=True)
    requirement_id: Optional[int] = None
    generated_by: str = "system"  # reviewer or system
    model_name: Optional[str] = None
    prompt: Optional[str] = None
    raw_response: Optional[str] = None
    timestamp: datetime.datetime = Field(default_factory=now_utc)
    produced_testcase_ids: Optional[str] = None  # json list string
    reviewer_confidence: Optional[float] = Field(default=None)
