# src/routers/generate_router.py
from fastapi import APIRouter, Body, HTTPException
from src.db import get_session
from src.models import Requirement, TestCase, GenerationEvent
from sqlmodel import select
import json, time, datetime, os
from google import genai
from pydantic import BaseModel # 👈 Add this import
from typing import List # 

GENAI_PROJECT = "tcgen-ai"
GENAI_LOCATION = os.environ.get("GENAI_LOCATION", "global")
GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.5-flash-lite")


class GeneratePreviewPayload(BaseModel):
    doc_id: int
    test_types: List[str]

class RegenerateBatchPayload(BaseModel):
    preview_ids: List[int]

router = APIRouter()

def build_generation_prompt(structured: dict, test_type: str = "positive") -> str:
    # Add specific instructions based on the test type
    type_instruction = ""
    if test_type == "negative":
        type_instruction = "Your goal is to create a **negative test case**. This means you should test what happens when an error condition occurs or when the primary condition of the requirement is NOT met."
    elif test_type == "boundary":
        type_instruction = "Your goal is to create a **boundary or edge-case test case**. Look for numerical triggers, timing constraints, or other limits and create a test that verifies the system's behavior precisely at that boundary."

    prompt = f"""
You are a test-case generator for healthcare requirements. Given the requirement structured JSON, produce a JSON object with:
- gherkin: a Gherkin scenario string (Given/When/Then)
- evidence: an array of evidence descriptions (short)
- automated_steps: an array of step strings
- sample_data: A JSON object with realistic, anonymized sample data needed to execute the test (e.g., a non-conforming FHIR message).
- code_scaffold: A Python code snippet using 'pytest' and 'requests' to automate the test steps.

{type_instruction}

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
def generate_preview(payload: GeneratePreviewPayload):
    sess = get_session()
    reqs = sess.exec(select(Requirement).where(Requirement.doc_id == payload.doc_id, Requirement.status == "approved")).all()
    created_previews = []
    
    for test_type in payload.test_types:
        for r in reqs:
            structured = json.loads(r.structured) if r.structured else {}
            prompt = build_generation_prompt(structured, test_type)
            
            try:
                res = call_vertex_generation(prompt)
            except Exception as e:
                sess.close()
                raise HTTPException(status_code=500, detail=f"Generation failed for type '{test_type}': {e}")
                
            parsed = res["parsed"]
            gherkin = parsed.get("gherkin", "")
            evidence = parsed.get("evidence", [])
            steps = parsed.get("automated_steps", [])
            sample_data = parsed.get("sample_data", {})
            code_scaffold = parsed.get("code_scaffold", "")
            code_scaffold_str = json.dumps(code_scaffold) if isinstance(code_scaffold, dict) else str(code_scaffold)
            
            tcid = f"TC-{r.requirement_id or 'REQ-'+str(r.id)}-{int(time.time())}"
            
            tc = TestCase(
                requirement_id=r.id,
                test_case_id=tcid,
                gherkin=gherkin,
                evidence_json=json.dumps(evidence),
                automated_steps_json=json.dumps(steps),
                status="preview",
                generated_at=datetime.datetime.now(datetime.timezone.utc),
                test_type=test_type,
                sample_data_json=json.dumps(sample_data),
                code_scaffold_str=code_scaffold_str
            )
            sess.add(tc)
            sess.commit()
            sess.refresh(tc)
            
            created_previews.append(tc.model_dump()) # Use the full model data
    
    sess.close()

    # 👇 THE CHANGE IS HERE: Return a list of the full preview objects
    return {"preview_count": len(created_previews), "previews": created_previews}


@router.post("/api/generate/confirm")
def generate_confirm(payload: dict = Body(...)):
    # payload: { "preview_ids": [1,2,...] }
    preview_ids = payload.get("preview_ids", [])
    reviewer_confidence = payload.get("reviewer_confidence") 
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
            ge = GenerationEvent(requirement_id=tc.requirement_id, generated_by="user-confirm", model_name=None, prompt=None, raw_response=None,
                                  produced_testcase_ids=json.dumps([tc.id]),
                                  reviewer_confidence=reviewer_confidence)
            sess.add(ge)
    sess.commit()
    sess.close()
    return {"confirmed": confirmed}

@router.get("/api/testcase/{tc_id}")
def get_testcase_details(tc_id: int):
    """
    Fetch the full details for a single test case.
    """
    with get_session() as sess:
        tc = sess.get(TestCase, tc_id)
        if not tc:
            raise HTTPException(status_code=404, detail="Test case not found")
        
        # The frontend expects JSON, so we convert the model to a dict.
        # SQLModel objects can be converted with .model_dump() or .dict()
        return tc.model_dump()
    

@router.post("/api/generate/regenerate/{preview_id}")
def regenerate_single_preview(preview_id: int):
    """
    Finds an existing test case preview and re-runs generation on its
    original requirement, updating the preview in place.
    """
    with get_session() as sess:
        # Step 1: Find the existing test case (preview) by its ID
        tc_to_regenerate = sess.get(TestCase, preview_id)
        if not tc_to_regenerate:
            raise HTTPException(status_code=404, detail="Test case preview not found")

        # Step 2: Find the original requirement it was based on
        original_req = sess.get(Requirement, tc_to_regenerate.requirement_id)
        if not original_req:
            raise HTTPException(status_code=404, detail="Original requirement not found for this test case")

        # Step 3: Re-run the generation logic using the original structured data and test type
        structured = json.loads(original_req.structured) if original_req.structured else {}
        test_type = tc_to_regenerate.test_type  # Use the original test type
        
        prompt = build_generation_prompt(structured, test_type)
        
        try:
            res = call_vertex_generation(prompt)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Re-generation failed: {e}")
        
        # Step 4: Update the fields of the existing test case object
        parsed = res["parsed"]
        tc_to_regenerate.gherkin = parsed.get("gherkin", "")
        tc_to_regenerate.evidence_json = json.dumps(parsed.get("evidence", []))
        tc_to_regenerate.automated_steps_json = json.dumps(parsed.get("automated_steps", []))
        tc_to_regenerate.sample_data_json = json.dumps(parsed.get("sample_data", {}))
        tc_to_regenerate.code_scaffold_str = parsed.get("code_scaffold", "")
        tc_to_regenerate.generated_at = datetime.datetime.now(datetime.timezone.utc) # Update the timestamp

        # Step 5: Commit the changes and return the updated object
        sess.add(tc_to_regenerate)
        sess.commit()
        sess.refresh(tc_to_regenerate)
        
        # The frontend expects a 'previews' list, so we can send back the updated one
        return {
            "message": "Test case regenerated successfully",
            "updated_preview": tc_to_regenerate.model_dump()
        }


@router.post("/api/generate/regenerate-batch")
def regenerate_batch_preview(payload: RegenerateBatchPayload):
    """
    Finds a list of existing test case previews and re-runs generation
    on their original requirements, updating them in place.
    """
    regenerated_count = 0
    with get_session() as sess:
        for preview_id in payload.preview_ids:
            tc_to_regenerate = sess.get(TestCase, preview_id)
            if not tc_to_regenerate:
                # You might want to collect errors instead of failing on the first one
                continue 

            original_req = sess.get(Requirement, tc_to_regenerate.requirement_id)
            if not original_req:
                continue

            # Prevent multiple regenerations (as per our design)
            if tc_to_regenerate.regeneration_count > 0:
                continue

            structured = json.loads(original_req.structured) if original_req.structured else {}
            test_type = tc_to_regenerate.test_type
            
            prompt = build_generation_prompt(structured, test_type)
            
            try:
                res = call_vertex_generation(prompt)
                parsed = res["parsed"]
                
                # Update the fields
                tc_to_regenerate.gherkin = parsed.get("gherkin", "")
                tc_to_regenerate.evidence_json = json.dumps(parsed.get("evidence", []))
                # ... update other fields ...
                tc_to_regenerate.code_scaffold_str = json.dumps(parsed.get("code_scaffold", "")) if isinstance(parsed.get("code_scaffold"), dict) else str(parsed.get("code_scaffold", ""))
                tc_to_regenerate.generated_at = datetime.datetime.now(datetime.timezone.utc)
                tc_to_regenerate.regeneration_count += 1 # Increment the count

                sess.add(tc_to_regenerate)
                regenerated_count += 1

            except Exception as e:
                # Log the error but continue the loop for other test cases
                print(f"Failed to regenerate test case {preview_id}: {e}")
                continue
        
        sess.commit()

    return {"message": "Batch regeneration complete.", "regenerated_count": regenerated_count}
