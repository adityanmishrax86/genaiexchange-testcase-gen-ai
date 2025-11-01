"""Unified pipeline router for orchestrating the complete workflow."""
import json
import os
import datetime
import shutil
import uuid
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional
from sqlmodel import select

from src.db import get_session
from src.models import Document, Requirement, TestCase
from src.services.document_parser import extract_text_from_file
from src.services.extraction import call_vertex_extraction

router = APIRouter()

UPLOAD_DIR = os.environ.get("UPLOAD_DIR", "./uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class PipelineStartRequest(BaseModel):
    upload_session_id: Optional[str] = None
    test_types: List[str] = ["positive", "negative", "boundary"]


class PipelineStatus(BaseModel):
    upload_session_id: str
    stage: str  # upload | extract | embed | generate | review | push
    progress: float  # 0-100
    message: str


@router.post("/api/pipeline/start")
async def start_pipeline(
    file: UploadFile = File(...),
    upload_session_id: Optional[str] = Form(None),
    test_types: Optional[str] = Form('["positive","negative","boundary"]'),
):
    """
    Start the complete pipeline: upload -> extract -> embed -> generate
    Returns session ID for tracking progress.
    """
    user = {"email": "dev-user@example.com"}

    try:
        # Step 1: Upload file
        filename = f"{int(datetime.datetime.now().timestamp())}_{file.filename}"
        dest = os.path.join(UPLOAD_DIR, filename)
        with open(dest, "wb") as out_f:
            shutil.copyfileobj(file.file, out_f)

        session_id = upload_session_id if upload_session_id else str(uuid.uuid4())

        doc = Document(
            filename=filename,
            uploaded_by=user.get("email"),
            upload_session_id=session_id,
            uploaded_at=datetime.datetime.now(datetime.timezone.utc),
        )

        sess = get_session()
        sess.add(doc)
        sess.commit()
        sess.refresh(doc)

        # Step 2: Extract text and create requirements
        text = extract_text_from_file(dest)
        if not text.strip():
            sess.close()
            raise HTTPException(status_code=400, detail="No text extracted from file")

        paras = [p.strip() for p in text.split("\n") if p.strip()]
        requirements_created = 0

        for p in paras:
            try:
                result = call_vertex_extraction(p)
                structured = result.get("structured", {}) if isinstance(result, dict) else {}
                error = result.get("error") if isinstance(result, dict) else None
                fc_map = structured.get("field_confidences") if isinstance(structured.get("field_confidences"), dict) else {}

                if fc_map:
                    vals = [float(v) for v in fc_map.values() if isinstance(v, (int, float))]
                    overall_confidence = float(sum(vals) / len(vals)) if vals else 0.5
                else:
                    overall_confidence = float(structured.get("overall_confidence", 0.5))

                req_status = "needs_manual_fix" if error else "extracted"

                req = Requirement(
                    doc_id=doc.id,
                    raw_text=p,
                    structured=json.dumps(structured),
                    field_confidences=json.dumps(fc_map),
                    overall_confidence=overall_confidence,
                    created_at=datetime.datetime.now(datetime.timezone.utc),
                    updated_at=datetime.datetime.now(datetime.timezone.utc),
                    status=req_status,
                    error_message=error,
                )
                sess.add(req)
                requirements_created += 1

            except Exception as e:
                print(f"Extraction failed for paragraph: {e}")
                continue

        sess.commit()
        sess.close()

        return {
            "upload_session_id": session_id,
            "doc_id": doc.id,
            "requirements_created": requirements_created,
            "message": "Upload and extraction complete. Call /api/rag/embed to generate embeddings, then /api/generate/preview for test cases.",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Pipeline start failed: {str(e)}")


@router.get("/api/pipeline/status/{upload_session_id}")
def get_pipeline_status(upload_session_id: str):
    """Get the current status of a pipeline session."""
    sess = get_session()
    try:
        stmt = select(Document).where(Document.upload_session_id == upload_session_id)
        doc = sess.exec(stmt).first()

        if not doc:
            raise HTTPException(status_code=404, detail="Session not found")

        # Count requirements
        req_stmt = select(Requirement).where(Requirement.doc_id == doc.id)
        requirements = sess.exec(req_stmt).all()

        extracted = len([r for r in requirements if r.status != "archived"])
        embedded = len([r for r in requirements if r.embeddings_json])
        approved = len([r for r in requirements if r.status == "approved"])

        # Count test cases
        test_stmt = select(TestCase).where(TestCase.requirement_id.in_([r.id for r in requirements]))
        test_cases = sess.exec(test_stmt).all()

        generated = len([t for t in test_cases if t.status in ["generated", "pushed"]])
        pushed = len([t for t in test_cases if t.status == "pushed"])

        # Determine overall stage
        if pushed > 0:
            stage = "push"
        elif generated > 0:
            stage = "generate"
        elif approved > 0:
            stage = "review"
        elif embedded > 0:
            stage = "embed"
        elif extracted > 0:
            stage = "extract"
        else:
            stage = "upload"

        progress = 0
        if extracted > 0:
            progress = 20
        if embedded == extracted:
            progress = 40
        if approved == extracted:
            progress = 60
        if generated > 0:
            progress = min(80, 60 + (generated / max(1, len(requirements)) * 20))
        if pushed > 0:
            progress = 100

        return {
            "upload_session_id": upload_session_id,
            "doc_id": doc.id,
            "stage": stage,
            "progress": round(progress, 2),
            "stats": {
                "total_requirements": extracted,
                "embedded": embedded,
                "approved": approved,
                "test_cases_generated": generated,
                "test_cases_pushed": pushed,
            },
        }

    finally:
        sess.close()


@router.post("/api/pipeline/auto-approve/{upload_session_id}")
def auto_approve_all(upload_session_id: str, confidence_threshold: float = 0.7):
    """
    Auto-approve all requirements in a session above confidence threshold.
    Useful for fast-tracking high-quality extractions.
    """
    sess = get_session()
    try:
        stmt = select(Document).where(Document.upload_session_id == upload_session_id)
        doc = sess.exec(stmt).first()

        if not doc:
            raise HTTPException(status_code=404, detail="Session not found")

        req_stmt = select(Requirement).where(Requirement.doc_id == doc.id)
        requirements = sess.exec(req_stmt).all()

        approved_count = 0
        for req in requirements:
            if req.overall_confidence >= confidence_threshold and req.status == "extracted":
                req.status = "approved"
                sess.add(req)
                approved_count += 1

        sess.commit()

        return {
            "approved_count": approved_count,
            "confidence_threshold": confidence_threshold,
            "message": f"Auto-approved {approved_count} requirements",
        }

    finally:
        sess.close()
