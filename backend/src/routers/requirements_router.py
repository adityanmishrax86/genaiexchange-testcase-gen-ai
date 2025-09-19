# src/routers/requirements_router.py
import datetime  
from fastapi import APIRouter, Query, HTTPException
from src.db import get_session
from src.models import Requirement, Document, TestCase # 👈 Corrected import
from sqlmodel import select
import json
from pydantic import BaseModel
from src.services.extraction import call_vertex_extraction 

class RequirementUpdatePayload(BaseModel):
    raw_text: str

router = APIRouter()

@router.get("/api/requirements")
def list_requirements(doc_id: int = Query(...)):
    sess = get_session()
    q = select(Requirement).where(Requirement.doc_id == doc_id)
    q = q.where(Requirement.status != "archived")
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


@router.put("/api/requirements/{req_id}")
def update_and_re_extract_requirement(req_id: int, payload: RequirementUpdatePayload):
    """
    Updates a requirement by archiving the old version and creating a new one.
    """
    with get_session() as sess:
        old_req = sess.get(Requirement, req_id)
        if not old_req:
            raise HTTPException(status_code=404, detail="Requirement not found")

        old_req.status = "archived"
        sess.add(old_req)

        stale_tcs = sess.exec(select(TestCase).where(TestCase.requirement_id == req_id)).all()
        for tc in stale_tcs:
            tc.status = "stale"
            sess.add(tc)
        
        result = call_vertex_extraction(payload.raw_text)
        
        structured = result.get("structured", {})
        error = result.get("error")
        fc_map = structured.get("field_confidences", {})
        status = "needs_manual_fix" if error else "extracted"
        overall_confidence = round(sum(fc_map.values()) / len(fc_map), 2) if fc_map else 0.5
        
        new_req = Requirement(
            doc_id=old_req.doc_id,
            requirement_id=old_req.requirement_id, 
            version=old_req.version + 1,          
            raw_text=payload.raw_text,
            structured=json.dumps(structured),
            field_confidences=json.dumps(fc_map),
            overall_confidence=overall_confidence,
            status=status,
            error_message=error,
            created_at=datetime.datetime.now(datetime.timezone.utc),
            updated_at=datetime.datetime.now(datetime.timezone.utc)
        )
        
        sess.add(new_req)
        
        sess.commit()
        sess.refresh(new_req)

        return new_req.model_dump()