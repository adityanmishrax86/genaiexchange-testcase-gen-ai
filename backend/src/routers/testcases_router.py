# src/routers/testcases_router.py
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import FileResponse
from src.db import get_session
from src.models import TestCase, Requirement, Document
from sqlmodel import select
import json, tempfile, os, csv, datetime

router = APIRouter()

@router.get("/api/testcases")
def list_testcases(upload_session_id: str = Query(None), doc_id: int = Query(None), status: str = Query(None)):
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

@router.get("/api/export/testcases/download")
def export_testcases_download(upload_session_id: str = Query(None), doc_id: int = Query(None)):
    sess = get_session()
    q = select(TestCase).join(Requirement, TestCase.requirement_id == Requirement.id).join(Document, Requirement.doc_id == Document.id).where(TestCase.status == "generated")
    if upload_session_id:
        q = q.where(Document.upload_session_id == upload_session_id)
    if doc_id:
        q = q.where(Requirement.doc_id == doc_id)
    rows = sess.exec(q).all()
    if not rows:
        sess.close()
        raise HTTPException(status_code=404, detail="No generated testcases to export")
    fd, tmp_path = tempfile.mkstemp(suffix=".csv")
    with os.fdopen(fd, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=["test_case_id","requirement_id","generated_at","status","evidence"])
        writer.writeheader()
        for t in rows:
            evidence = json.loads(t.evidence_json) if t.evidence_json else []
            steps = json.loads(t.automated_steps_json) if t.automated_steps_json else []
            writer.writerow({
                "test_case_id": t.test_case_id,
                "requirement_id": t.requirement_id,
                "generated_at": t.generated_at.isoformat(),
                "status": t.status,
                "evidence": "; ".join([str(e) for e in evidence])
                
            })
    sess.close()
    return FileResponse(tmp_path, filename=f"test_cases_{int(datetime.datetime.now().timestamp())}.csv", media_type="text/csv")
