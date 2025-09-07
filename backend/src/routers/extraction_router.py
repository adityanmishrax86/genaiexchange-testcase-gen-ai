# src/routers/extraction_router.py
from fastapi import APIRouter, HTTPException, Query
from src.db import get_session
from src.models import Document, Requirement, GenerationEvent
from src.services.extraction import call_vertex_extraction
from sqlmodel import select
import json
import os
import datetime

router = APIRouter()

@router.post("/api/extract/{doc_id}")
def extract_for_doc(doc_id: int, upload_session_id: str = Query(None)):
    sess = get_session()
    try:
        doc = sess.get(Document, doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")
        if upload_session_id and doc.upload_session_id != upload_session_id:
            raise HTTPException(status_code=403, detail="Document not in provided session")

        path = os.path.join(os.environ.get("UPLOAD_DIR", "./uploads"), doc.filename)
        if not os.path.exists(path):
            raise HTTPException(status_code=404, detail="Uploaded file missing on disk")

        # read file content (text files expected; binary formats should be pre-processed)
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            text = f.read()

        # split into candidate paragraphs (simple heuristic)
        paras = [p.strip() for p in text.split("\n\n") if p.strip()]
        created = []

        for p in paras:
            try:
                result = call_vertex_extraction(p)
            except Exception as e:
                # raise an HTTP error but ensure session closed outside
                raise HTTPException(status_code=500, detail=f"Extraction failed for paragraph: {str(e)}")

            structured = result.get("structured", {}) if isinstance(result, dict) else {}
            raw = result.get("raw") if isinstance(result, dict) else None

            # compute overall_confidence defensively
            fc_map = structured.get("field_confidences") if isinstance(structured.get("field_confidences"), dict) else {}
            if fc_map:
                try:
                    vals = [float(v) for v in fc_map.values() if isinstance(v, (int, float))]
                    overall_confidence = float(sum(vals) / len(vals)) if vals else 0.5
                except Exception:
                    overall_confidence = 0.5
            else:
                overall_confidence = float(structured.get("overall_confidence", 0.5))

            # persist requirement
            req = Requirement(
                doc_id=doc.id,
                raw_text=p,
                structured=json.dumps(structured),
                field_confidences=json.dumps(fc_map),
                overall_confidence=overall_confidence,
                created_at=datetime.datetime.now(datetime.timezone.utc),
                updated_at=datetime.datetime.now(datetime.timezone.utc)
            )
            sess.add(req)
            sess.commit()
            sess.refresh(req)

            # log extraction as a generation event (audit)
            ge = GenerationEvent(
                requirement_id=req.id,
                generated_by="vertex-extraction",
                model_name=result.get("model") if isinstance(result, dict) else None,
                prompt=None,
                raw_response=raw,
                produced_testcase_ids=None
            )
            sess.add(ge)
            sess.commit()

            created.append({"id": req.id, "requirement_id": structured.get("requirement_id"), "raw_text": p})

        return {"created_requirements": created}
    finally:
        sess.close()
