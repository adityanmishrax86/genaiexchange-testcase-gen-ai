# src/routers/review_router.py
from fastapi import APIRouter, Body, HTTPException
from src.db import get_session
from src.models import Requirement, ReviewEvent, TestCase
from sqlmodel import select
import json
import datetime

router = APIRouter()

@router.post("/api/review/{req_id}")
def review_requirement(req_id: int, payload: dict = Body(...)):
    reviewer = payload.get("reviewer", "dev-user@example.com")
    edits = payload.get("edits", {})
    review_confidence = float(payload.get("review_confidence", 0.9))
    note = payload.get("note", "")
    sess = get_session()
    req = sess.get(Requirement, req_id)
    if not req:
        sess.close()
        raise HTTPException(status_code=404, detail="Requirement not found")
    structured = json.loads(req.structured) if req.structured else {}
    diffs = {}
    for k, v in edits.items():
        old = structured.get(k)
        if old != v:
            diffs[k] = {"old": old, "new": v}
            structured[k] = v
    req.structured = json.dumps(structured)
    fc = json.loads(req.field_confidences) if req.field_confidences else {}
    for k in edits.keys():
        fc[k] = round(max(0.0, min(0.99, review_confidence)), 2)
    req.field_confidences = json.dumps(fc)
    req.overall_confidence = round(sum(fc.values()) / len(fc), 2) if fc else req.overall_confidence
    req.updated_at = datetime.datetime.now(datetime.timezone.utc)
    req.status = "approved" if review_confidence >= 0.7 else "needs_second_review"
    sess.add(req)
    ev = ReviewEvent(requirement_id=req.id, reviewer=reviewer, action="edit_and_review", note=note, diffs=json.dumps(diffs) if diffs else None, reviewer_confidence=review_confidence, timestamp=datetime.datetime.now(datetime.timezone.utc))
    sess.add(ev)
    sess.commit()
    tcs = sess.exec(select(TestCase).where(TestCase.requirement_id == req.id)).all()
    for t in tcs:
        t.status = "stale"
        sess.add(t)
    sess.commit()
    sess.refresh(req)
    out = {"req_id": int(req.id), "status": req.status, "diffs": diffs, "field_confidences": json.loads(req.field_confidences) if req.field_confidences else {}}
    sess.close()
    return out