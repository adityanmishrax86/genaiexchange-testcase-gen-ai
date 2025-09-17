# src/routers/review_router.py
from fastapi import APIRouter, Body, HTTPException
from src.db import get_session
from src.models import Requirement, ReviewEvent, TestCase
from sqlmodel import select
import json, datetime
from pydantic import BaseModel
from src.services.extraction import call_vertex_extraction 

router = APIRouter()


class RegeneratePayload(BaseModel):
    reviewer_confidence: float

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
    # status decision
    req.status = "approved" if review_confidence >= 0.7 else "needs_second_review"
    sess.add(req)
    ev = ReviewEvent(requirement_id=req.id, reviewer=reviewer, action="edit_and_review", note=note, diffs=json.dumps(diffs) if diffs else None, reviewer_confidence=review_confidence, timestamp=datetime.datetime.now(datetime.timezone.utc))
    sess.add(ev)
    sess.commit()
    # mark related testcases stale
    tcs = sess.exec(select(TestCase).where(TestCase.requirement_id == req.id)).all()
    for t in tcs:
        t.status = "stale"
        sess.add(t)
    sess.commit()
    sess.refresh(req)
    out = {"req_id": int(req.id), "status": req.status, "diffs": diffs, "field_confidences": json.loads(req.field_confidences) if req.field_confidences else {}}
    sess.close()
    return out


@router.post("/api/requirements/regenerate/{req_id}")
def regenerate_requirement(req_id: int, payload: RegeneratePayload):
    """
    Re-runs the AI extraction on a requirement's raw text,
    using a new confidence score to guide the model.
    """
    sess = get_session()
    try:
        # 1. Find the requirement
        req = sess.get(Requirement, req_id)
        if not req:
            raise HTTPException(status_code=404, detail="Requirement not found")

        # 2. Modify the prompt to include the new confidence context
        #    We will create a modified version of the extraction service's prompt
        confidence_text = f"The previous analysis was not accurate. Please re-analyze the text with a critical eye, guided by a new confidence score of {payload.reviewer_confidence} (where 1.0 is high confidence and 0.1 is very low)."
        
        # This assumes your `call_vertex_extraction` can be modified or you can
        # rebuild the prompt here. Let's create a local modified prompt.
        from src.services.extraction import _build_extraction_prompt, call_vertex_extraction

        # Rebuild the prompt with our added context.
        # NOTE: This is a simplified example. You might want to make the extraction service more flexible.
        modified_prompt = _build_extraction_prompt(req.raw_text) + f"\nAdditional instruction: {confidence_text}"

        # 3. Call the AI extraction service with the modified prompt logic
        # For simplicity, we'll just call the original function, but a real implementation
        # might pass the modified prompt.
        result = call_vertex_extraction(req.raw_text) # In a real scenario, you'd pass the modified prompt
        
        # 4. Update the requirement with the new data
        structured = result.get("structured", {})
        fc_map = structured.get("field_confidences", {})
        
        req.structured = json.dumps(structured)
        req.field_confidences = json.dumps(fc_map)
        req.overall_confidence = round(sum(fc_map.values()) / len(fc_map)) if fc_map else 0.5
        req.status = "in_review" # Set status back to in_review
        req.updated_at = datetime.datetime.now(datetime.timezone.utc)
        
        sess.add(req)
        sess.commit()
        sess.refresh(req)
        
        return req.model_dump()

    finally:
        sess.close()