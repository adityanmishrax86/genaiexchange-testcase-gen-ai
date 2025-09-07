# src/routers/requirements_router.py
from fastapi import APIRouter, Query, HTTPException
from src.db import get_session
from src.models import Requirement, Document
from sqlmodel import select
import json

router = APIRouter()

@router.get("/api/requirements")
def list_requirements(doc_id: int = Query(...)):
    sess = get_session()
    q = select(Requirement).where(Requirement.doc_id == doc_id)
    rows = sess.exec(q).all()
    out = []
    for r in rows:
        out.append({
            "id": r.id,
            "requirement_id": r.requirement_id,
            "raw_text": r.raw_text,
            "structured": json.loads(r.structured) if r.structured else {},
            "field_confidences": json.loads(r.field_confidences) if r.field_confidences else {},
            "overall_confidence": r.overall_confidence,
            "status": r.status
        })
    sess.close()
    return out

@router.get("/api/requirements/{req_id}")
def get_requirement(req_id: int):
    sess = get_session()
    r = sess.get(Requirement, req_id)
    if not r:
        sess.close()
        raise HTTPException(status_code=404, detail="Not found")
    out = {
        "id": r.id,
        "requirement_id": r.requirement_id,
        "raw_text": r.raw_text,
        "structured": json.loads(r.structured) if r.structured else {},
        "field_confidences": json.loads(r.field_confidences) if r.field_confidences else {},
        "overall_confidence": r.overall_confidence,
        "status": r.status
    }
    sess.close()
    return out
