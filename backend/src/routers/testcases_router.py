# src/routers/testcases_router.py
from fastapi import APIRouter, Query
from src.db import get_session
from src.models import TestCase, Requirement, Document
from sqlmodel import select

router = APIRouter()

@router.get("/api/testcases")
def list_testcases(upload_session_id: str = Query(None), doc_id: int = Query(None), status: str = Query(None)):
    """
    List test cases with optional filtering by upload session, document, or status.
    """
    sess = get_session()
    q = select(TestCase).join(Requirement, TestCase.requirement_id == Requirement.id).join(Document, Requirement.doc_id == Document.id)
    if doc_id:
        q = q.where(Requirement.doc_id == doc_id)
    if upload_session_id:
        q = q.where(Document.upload_session_id == upload_session_id)
    if status:
        q = q.where(TestCase.status == status)
    rows = sess.exec(q).all()
    out = []
    for t in rows:
        out.append({"id": t.id, "test_case_id": t.test_case_id, "requirement_id": t.requirement_id, "status": t.status, "generated_at": t.generated_at.isoformat()})
    sess.close()
    return out
