# src/routers/generate_router.py
from fastapi import APIRouter, Body, HTTPException
from src.db import get_session
from src.models import Requirement, TestCase, GenerationEvent
from sqlmodel import select
import json, time, datetime, os
from google import genai

GENAI_PROJECT = "tcgen-ai"
GENAI_LOCATION = os.environ.get("GENAI_LOCATION", "global")
GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.5-flash-lite")

router = APIRouter()

def build_generation_prompt(structured: dict) -> str:
    # Simple prompt that instructs the LLM to produce a Gherkin scenario and a JSON metadata block
    # The assistant should return only JSON with keys: gherkin (string), evidence (array), automated_steps (array)
    prompt = f"""
You are a test-case generator for healthcare requirements. Given the requirement structured JSON, produce a JSON object with:
- gherkin: a Gherkin scenario string (Given/When/Then)
- evidence: an array of evidence descriptions (short)
- automated_steps: an array of step strings

Input structured requirement:
{json.dumps(structured)}

Return only the JSON object.
"""
    return prompt

def call_vertex_generation(prompt: str) -> dict:
    if not GENAI_PROJECT:
        raise RuntimeError("GENAI_PROJECT not configured for generation")
    client = genai.Client(vertexai=True, project=GENAI_PROJECT, location=GENAI_LOCATION)
    resp = client.models.generate_content(model=GENAI_MODEL, contents=[prompt])
    raw = resp.text or ""
    # parse JSON out
    try:
        parsed = json.loads(raw)
    except Exception:
        import re
        m = re.search(r"(\{.*\})", raw, flags=re.S)
        if m:
            parsed = json.loads(m.group(1))
        else:
            raise RuntimeError("No JSON produced by model for generation")
    return {"parsed": parsed, "raw": raw, "model": GENAI_MODEL}

@router.post("/api/generate/preview")
def generate_preview(payload: dict = Body(...)):
    """
    payload: { "doc_id": <int> }
    """
    doc_id = payload.get("doc_id")
    if not doc_id:
        raise HTTPException(status_code=400, detail="doc_id required")
    sess = get_session()
    reqs = sess.exec(select(Requirement).where(Requirement.doc_id == doc_id)).all()
    previews = []
    for r in reqs:
        structured = json.loads(r.structured) if r.structured else {}
        prompt = build_generation_prompt(structured)
        try:
            res = call_vertex_generation(prompt)
        except Exception as e:
            sess.close()
            raise HTTPException(status_code=500, detail=f"Generation failed: {e}")
        parsed = res["parsed"]
        gherkin = parsed.get("gherkin", "")
        evidence = parsed.get("evidence", [])
        steps = parsed.get("automated_steps", [])
        tcid = f"TC-{r.requirement_id or 'REQ-'+str(r.id)}-{int(time.time())}"
        tc = TestCase(requirement_id=r.id, test_case_id=tcid, gherkin=gherkin, evidence_json=json.dumps(evidence), automated_steps_json=json.dumps(steps), status="preview", generated_at=datetime.datetime.now(datetime.timezone.utc))
        sess.add(tc)
        sess.commit()
        sess.refresh(tc)
        # record generation event
        ge = GenerationEvent(requirement_id=r.id, generated_by="vertex-generation-preview", model_name=res.get("model"), prompt=prompt, raw_response=res.get("raw"), produced_testcase_ids=json.dumps([tc.id]))
        sess.add(ge)
        sess.commit()
        previews.append({"preview_id": tc.id, "test_case_id": tc.test_case_id, "gherkin": gherkin})
    sess.close()
    return {"preview_count": len(previews), "previews": previews}

@router.post("/api/generate/confirm")
def generate_confirm(payload: dict = Body(...)):
    # payload: { "preview_ids": [1,2,...] }
    preview_ids = payload.get("preview_ids", [])
    if not preview_ids:
        raise HTTPException(status_code=400, detail="preview_ids required")
    sess = get_session()
    tcs = sess.exec(select(TestCase).where(TestCase.id.in_(preview_ids))).all()
    confirmed = 0
    for tc in tcs:
        if tc.status == "preview":
            tc.status = "generated"
            sess.add(tc)
            confirmed += 1
            # record a generation event that this preview was confirmed
            ge = GenerationEvent(requirement_id=tc.requirement_id, generated_by="user-confirm", model_name=None, prompt=None, raw_response=None, produced_testcase_ids=json.dumps([tc.id]))
            sess.add(ge)
    sess.commit()
    sess.close()
    return {"confirmed": confirmed}
