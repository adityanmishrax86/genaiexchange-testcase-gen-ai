"""Router for test case generation from requirements using Gemini LLM.

Provides endpoints to generate, preview, confirm, and regenerate test cases
from approved requirements using Google's Gemini model. Supports multiple
test case types (positive, negative, boundary) with human review workflow.
"""
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from src.db import get_session
from src.models import GenerationEvent, Requirement, TestCase
from src.services.gemini_client import GeminiClient

logger = logging.getLogger(__name__)

GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.5-flash-lite")


class GeneratePreviewPayload(BaseModel):
    """Request payload for generating test case previews."""

    doc_id: int
    test_types: List[str]


class RegenerateBatchPayload(BaseModel):
    """Request payload for regenerating test case batch."""

    preview_ids: List[int]


router = APIRouter()


def build_generation_prompt(
    client: GeminiClient, structured: dict, test_type: str = "positive"
) -> str:
    """Build test case generation prompt using template file.

    Uses the generation_prompt_v1.txt template with type-specific instructions.

    Args:
        client: GeminiClient instance for loading prompts.
        structured: Structured requirement data (already extracted).
        test_type: Type of test case (positive, negative, boundary).

    Returns:
        Formatted prompt string for Gemini model.
    """
    # Build type-specific instruction
    type_instruction = ""
    if test_type == "negative":
        type_instruction = (
            "TYPE: Negative Test Case\n"
            "Goal: Test what happens when an error condition occurs or when "
            "the primary condition of the requirement is NOT met. "
            "Test error handling, boundary violations, or invalid inputs."
        )
    elif test_type == "boundary":
        type_instruction = (
            "TYPE: Boundary Test Case\n"
            "Goal: Test behavior at boundary conditions. "
            "Look for numerical triggers, timing constraints, or limits. "
            "Test values just below, at, and just above boundaries "
            "(e.g., for threshold=88, test 87, 88, 89)."
        )
    else:  # positive (default)
        type_instruction = (
            "TYPE: Positive Test Case\n"
            "Goal: Test the normal, happy-path scenario where the requirement "
            "is met and the system behaves as specified."
        )

    # Load base template
    prompt = client.build_prompt(
        "generation_prompt_v1.txt",
        json.dumps(structured, indent=2)
    )

    # Replace TYPE_INSTRUCTION placeholder
    prompt = prompt.replace("{{TYPE_INSTRUCTION}}", type_instruction)

    return prompt

@router.post("/api/generate/preview")
def generate_preview(payload: GeneratePreviewPayload):
    """Generate test case previews for approved requirements.

    For each test type and requirement, generates a test case preview
    using Gemini LLM and stores it as a preview status.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured"
        )

    client = GeminiClient(api_key=api_key, model_name=GENAI_MODEL)
    sess = get_session()

    try:
        # Fetch approved requirements for the document
        query = select(Requirement).where(
            Requirement.doc_id == payload.doc_id,
            Requirement.status == "approved"
        )
        reqs = sess.exec(query).all()

        if not reqs:
            raise HTTPException(
                status_code=404,
                detail="No approved requirements found for document"
            )

        created_previews = []

        for test_type in payload.test_types:
            for r in reqs:
                structured = (
                    json.loads(r.structured)
                    if r.structured
                    else {}
                )
                prompt = build_generation_prompt(client, structured, test_type)

                try:
                    # Call Gemini - returns JSON string
                    response_json_str = (
                        client.generate_structured_response(
                            prompt,
                            response_schema=None
                        )
                    )

                    # Parse JSON response
                    if isinstance(response_json_str, str):
                        parsed = json.loads(response_json_str)
                    else:
                        parsed = response_json_str

                    # Validate response is a dict
                    if not isinstance(parsed, dict):
                        logger.error(
                            "Invalid response for type %s: "
                            "expected dict, got %s",
                            test_type,
                            type(parsed).__name__,
                        )
                        raise ValueError(
                            f"Expected dict, got {type(parsed).__name__}"
                        )

                except json.JSONDecodeError as e:
                    logger.warning(
                        "Failed to parse JSON for test type %s: %s",
                        test_type,
                        str(e),
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=(
                            f"Invalid JSON from generation for "
                            f"type '{test_type}': {str(e)}"
                        ),
                    ) from e
                except ValueError as e:
                    logger.error(
                        "Response validation failed: %s",
                        str(e),
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=f"Invalid response format: {str(e)}",
                    ) from e
                except Exception as e:
                    logger.error(
                        "Generation failed for type %s: %s",
                        test_type,
                        str(e),
                    )
                    raise HTTPException(
                        status_code=500,
                        detail=f"Generation failed for type '{test_type}': {e}",
                    ) from e

                # Extract test case fields from response
                gherkin = parsed.get("gherkin", "")
                evidence = parsed.get("evidence", [])
                steps = parsed.get("automated_steps", [])
                sample_data = parsed.get("sample_data", {})
                code_scaffold = parsed.get("code_scaffold", "")
                code_scaffold_str = (
                    json.dumps(code_scaffold)
                    if isinstance(code_scaffold, dict)
                    else str(code_scaffold)
                )

                tcid = (
                    f"TC-{r.requirement_id or 'REQ-' + str(r.id)}-"
                    f"{int(time.time())}"
                )

                tc = TestCase(
                    requirement_id=r.id,
                    test_case_id=tcid,
                    gherkin=gherkin,
                    evidence_json=json.dumps(evidence),
                    automated_steps_json=json.dumps(steps),
                    status="preview",
                    generated_at=datetime.now(timezone.utc),
                    test_type=test_type,
                    sample_data_json=json.dumps(sample_data),
                    code_scaffold_str=code_scaffold_str
                )
                sess.add(tc)
                sess.commit()
                sess.refresh(tc)

                # Log generation event for audit trail
                ge = GenerationEvent(
                    requirement_id=r.id,
                    generated_by="gemini-generation",
                    model_name=GENAI_MODEL,
                    prompt=prompt,
                    raw_response=response_json_str,
                    produced_testcase_ids=json.dumps([tc.id])
                )
                sess.add(ge)
                sess.commit()

                created_previews.append(tc.model_dump())

        return {
            "preview_count": len(created_previews),
            "previews": created_previews
        }
    finally:
        sess.close()


@router.post("/api/generate/confirm")
def generate_confirm(payload: dict = Body(...)):
    """Confirm test case previews and mark them as generated.

    Transitions test cases from 'preview' status to 'generated' status
    and records a generation event for audit trail.
    """
    preview_ids = payload.get("preview_ids", [])
    reviewer_confidence = payload.get("reviewer_confidence")

    if not preview_ids:
        raise HTTPException(
            status_code=400,
            detail="preview_ids required"
        )

    sess = get_session()
    try:
        query = select(TestCase).where(TestCase.id.in_(preview_ids))
        tcs = sess.exec(query).all()

        confirmed = 0
        for tc in tcs:
            if tc.status == "preview":
                tc.status = "generated"
                sess.add(tc)
                confirmed += 1

                # Record generation event for audit trail
                ge = GenerationEvent(
                    requirement_id=tc.requirement_id,
                    generated_by="user-confirm",
                    model_name=None,
                    prompt=None,
                    raw_response=None,
                    produced_testcase_ids=json.dumps([tc.id]),
                    reviewer_confidence=reviewer_confidence
                )
                sess.add(ge)

        sess.commit()
        return {"confirmed": confirmed}
    finally:
        sess.close()

@router.get("/api/testcase/{tc_id}")
def get_testcase_details(tc_id: int):
    """Fetch the full details for a single test case."""
    with get_session() as sess:
        tc = sess.get(TestCase, tc_id)
        if not tc:
            raise HTTPException(
                status_code=404,
                detail="Test case not found"
            )

        return tc.model_dump()


@router.post("/api/generate/regenerate/{preview_id}")
def regenerate_single_preview(preview_id: int):
    """Regenerate a single test case preview.

    Finds an existing test case preview and re-runs generation on its
    original requirement, updating the preview in place.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured"
        )

    client = GeminiClient(api_key=api_key, model_name=GENAI_MODEL)
    sess = get_session()

    try:
        tc_to_regenerate = sess.get(TestCase, preview_id)
        if not tc_to_regenerate:
            raise HTTPException(
                status_code=404,
                detail="Test case preview not found"
            )

        original_req = sess.get(Requirement, tc_to_regenerate.requirement_id)
        if not original_req:
            raise HTTPException(
                status_code=404,
                detail="Original requirement not found for test case"
            )

        structured = (
            json.loads(original_req.structured)
            if original_req.structured
            else {}
        )
        test_type = tc_to_regenerate.test_type

        prompt = build_generation_prompt(client, structured, test_type)

        try:
            # Call Gemini - returns JSON string
            response_json_str = client.generate_structured_response(
                prompt,
                response_schema=None
            )

            # Parse JSON response
            if isinstance(response_json_str, str):
                parsed = json.loads(response_json_str)
            else:
                parsed = response_json_str

            # Validate response is a dict
            if not isinstance(parsed, dict):
                raise ValueError(
                    f"Expected dict, got {type(parsed).__name__}"
                )

        except json.JSONDecodeError as e:
            logger.warning(
                "Failed to parse JSON during regeneration: %s",
                str(e)
            )
            raise HTTPException(
                status_code=500,
                detail=f"Invalid JSON from regeneration: {str(e)}"
            ) from e
        except Exception as e:
            logger.error("Regeneration failed: %s", str(e))
            raise HTTPException(
                status_code=500,
                detail=f"Regeneration failed: {e}"
            ) from e

        # Update test case with new values
        tc_to_regenerate.gherkin = parsed.get("gherkin", "")
        tc_to_regenerate.evidence_json = json.dumps(
            parsed.get("evidence", [])
        )
        tc_to_regenerate.automated_steps_json = json.dumps(
            parsed.get("automated_steps", [])
        )
        tc_to_regenerate.sample_data_json = json.dumps(
            parsed.get("sample_data", {})
        )
        tc_to_regenerate.code_scaffold_str = parsed.get("code_scaffold", "")
        tc_to_regenerate.generated_at = datetime.now(timezone.utc)

        sess.add(tc_to_regenerate)
        sess.commit()
        sess.refresh(tc_to_regenerate)

        return {
            "message": "Test case regenerated successfully",
            "updated_preview": tc_to_regenerate.model_dump()
        }
    finally:
        sess.close()


@router.post("/api/generate/regenerate-batch")
def regenerate_batch_preview(payload: RegenerateBatchPayload):
    """Regenerate multiple test case previews in batch.

    Re-runs generation on their original requirements, updating
    them in place. Skips failed regenerations without blocking others.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured"
        )

    client = GeminiClient(api_key=api_key, model_name=GENAI_MODEL)
    regenerated_count = 0

    with get_session() as sess:
        for preview_id in payload.preview_ids:
            tc_to_regenerate = sess.get(TestCase, preview_id)
            if not tc_to_regenerate:
                continue

            original_req = sess.get(Requirement, tc_to_regenerate.requirement_id)
            if not original_req:
                continue

            if tc_to_regenerate.regeneration_count > 0:
                continue

            structured = (
                json.loads(original_req.structured)
                if original_req.structured
                else {}
            )
            test_type = tc_to_regenerate.test_type

            prompt = build_generation_prompt(client, structured, test_type)

            try:
                # Call Gemini - returns JSON string
                response_json_str = client.generate_structured_response(
                    prompt,
                    response_schema=None
                )

                # Parse JSON response
                if isinstance(response_json_str, str):
                    parsed = json.loads(response_json_str)
                else:
                    parsed = response_json_str

                # Validate response is a dict
                if not isinstance(parsed, dict):
                    logger.warning(
                        "Invalid response format for test case %d: %s",
                        preview_id,
                        type(parsed),
                    )
                    continue

                tc_to_regenerate.gherkin = parsed.get("gherkin", "")
                tc_to_regenerate.evidence_json = json.dumps(
                    parsed.get("evidence", [])
                )
                tc_to_regenerate.code_scaffold_str = (
                    json.dumps(parsed.get("code_scaffold", ""))
                    if isinstance(parsed.get("code_scaffold"), dict)
                    else str(parsed.get("code_scaffold", ""))
                )
                tc_to_regenerate.generated_at = datetime.now(timezone.utc)
                tc_to_regenerate.regeneration_count += 1

                sess.add(tc_to_regenerate)
                regenerated_count += 1

            except Exception as e:
                logger.warning(
                    "Failed to regenerate test case %d: %s",
                    preview_id,
                    str(e)
                )
                continue

        sess.commit()

    return {
        "message": "Batch regeneration complete.",
        "regenerated_count": regenerated_count
    }
