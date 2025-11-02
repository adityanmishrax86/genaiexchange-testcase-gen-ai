"""Router for requirement extraction from documents using Gemini LLM.

Provides endpoints to extract and structure requirements from uploaded
documents using Google's Gemini model with confidence scoring.
"""
import json
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query

from src.db import get_session
from src.models import Document, Requirement, GenerationEvent
from src.services.document_parser import extract_text_from_file
from src.services.gemini_client import GeminiClient

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/api/extract/{doc_id}")
def extract_for_doc(doc_id: int, upload_session_id: str = Query(None)):
    """Extract requirements from document using Gemini LLM.

    Extracts text from an uploaded document, splits it into paragraphs,
    and calls Gemini to structure each paragraph as a requirement.
    Each requirement is stored with confidence scores and audit trail.
    """
    # Get API key and model from environment
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GENAI_MODEL", "gemini-2.5-flash-lite")

    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY not configured"
        )

    evaluator = GeminiClient(api_key=api_key, model_name=model_name)
    sess = get_session()

    try:
        doc = sess.get(Document, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        if upload_session_id and doc.upload_session_id != upload_session_id:
            raise HTTPException(
                status_code=403,
                detail="Document not in provided session"
            )

        upload_dir = os.environ.get("UPLOAD_DIR", "./uploads")
        path = os.path.join(upload_dir, doc.filename)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Uploaded file missing")

        text = extract_text_from_file(path)

        if not text.strip():
            raise HTTPException(
                status_code=400,
                detail="No text could be extracted from document"
            )

        paras = [p.strip() for p in text.split("\n") if p.strip()]
        created = []

        for p in paras:
            try:
                # Build prompt for THIS paragraph
                prompt = evaluator.build_prompt(
                    "extraction_prompt_v2.txt", p
                )

                # Call Gemini - returns JSON string
                # No response_schema needed for flexible requirement extraction
                response_json_str = (
                    evaluator.generate_structured_response(
                        prompt,
                        response_schema=None
                    )
                )

                # Parse JSON response into dict
                if isinstance(response_json_str, str):
                    result = json.loads(response_json_str)
                else:
                    result = response_json_str

            except json.JSONDecodeError as e:
                logger.warning(
                    "Failed to parse JSON for paragraph: %s",
                    str(e)
                )
                raise HTTPException(
                    status_code=500,
                    detail=f"Invalid JSON response from extraction: {str(e)}"
                ) from e
            except Exception as e:
                logger.error("Extraction failed for paragraph: %s", str(e))
                raise HTTPException(
                    status_code=500,
                    detail=f"Extraction failed for paragraph: {str(e)}"
                ) from e

            # Extract structured data from response
            structured = result if isinstance(result, dict) else {}
            error = None
            raw_response_str = (
                response_json_str
                if isinstance(response_json_str, str)
                else json.dumps(response_json_str)
            )

            # Extract field confidences if present
            fc_map = structured.get("field_confidences", {})
            if isinstance(fc_map, dict) and fc_map:
                try:
                    vals = [
                        float(v)
                        for v in fc_map.values()
                        if isinstance(v, (int, float))
                    ]
                    overall_confidence = (
                        float(sum(vals) / len(vals)) if vals else 0.7
                    )
                except (ValueError, TypeError):
                    overall_confidence = 0.7
            else:
                overall_confidence = 0.7

            req_status = "extracted"

            req = Requirement(
                doc_id=doc.id,
                raw_text=p,
                structured=json.dumps(structured),
                field_confidences=json.dumps(fc_map),
                overall_confidence=overall_confidence,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
                status=req_status,
                error_message=error
            )
            sess.add(req)
            sess.commit()
            sess.refresh(req)

            # Log generation event for audit trail
            ge = GenerationEvent(
                requirement_id=req.id,
                generated_by="gemini-extraction",
                model_name=model_name,
                prompt=prompt,
                raw_response=raw_response_str,
                produced_testcase_ids=None
            )
            sess.add(ge)
            sess.commit()

            created.append({
                "id": req.id,
                "requirement_id": structured.get("requirement_id"),
                "raw_text": p
            })

        return {"created_requirements": created}
    finally:
        sess.close()

