"""RAG embeddings router for document vectorization and semantic search."""
import json
import datetime
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional

from src.db import get_session
from src.models import Document, Requirement
from src.services.embeddings import generate_embeddings, chunk_text
from sqlmodel import select

router = APIRouter()


class EmbeddingRequest(BaseModel):
    doc_id: int
    chunk_size: int = 500


class EmbeddingResponse(BaseModel):
    doc_id: int
    chunks_processed: int
    embedding_dimension: int
    model: str


class SemanticSearchRequest(BaseModel):
    doc_id: int
    query: str
    top_k: int = 5


@router.post("/api/rag/embed", response_model=EmbeddingResponse)
def generate_doc_embeddings(request: EmbeddingRequest):
    """
    Generate embeddings for all requirements in a document.
    Stores embeddings as JSON in the requirement record.
    """
    sess = get_session()
    try:
        doc = sess.get(Document, request.doc_id)
        if not doc:
            raise HTTPException(status_code=404, detail="Document not found")

        stmt = select(Requirement).where(Requirement.doc_id == request.doc_id)
        requirements = sess.exec(stmt).all()

        if not requirements:
            raise HTTPException(status_code=404, detail="No requirements found for document")

        chunks_processed = 0
        embedding_dim = 0

        for req in requirements:
            raw_text = req.raw_text or ""
            if not raw_text.strip():
                continue

            # Chunk the text for better embedding quality
            chunks = chunk_text(raw_text, chunk_size=request.chunk_size)

            if not chunks:
                continue

            try:
                result = generate_embeddings(chunks)
                embeddings = result.get("embeddings", [])
                embedding_dim = result.get("embedding_dimension", 0)

                # Store embeddings as JSON
                embedding_data = {
                    "chunks": chunks,
                    "embeddings": embeddings,
                    "model": result.get("model"),
                    "generated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }

                req.embeddings_json = json.dumps(embedding_data)
                sess.add(req)
                chunks_processed += len(chunks)

            except Exception as e:
                # Log error but continue processing other requirements
                print(f"Failed to embed requirement {req.id}: {e}")
                continue

        sess.commit()

        return EmbeddingResponse(
            doc_id=request.doc_id,
            chunks_processed=chunks_processed,
            embedding_dimension=embedding_dim,
            model="text-embedding-004",
        )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {str(e)}")
    finally:
        sess.close()


@router.post("/api/rag/search")
def semantic_search(request: SemanticSearchRequest):
    """
    Search requirements by semantic similarity to a query.
    Uses cosine similarity over embedded chunks.
    """
    import numpy as np

    sess = get_session()
    try:
        # Generate embedding for query
        query_result = generate_embeddings([request.query])
        query_embedding = query_result["embeddings"][0]

        stmt = select(Requirement).where(Requirement.doc_id == request.doc_id)
        requirements = sess.exec(stmt).all()

        results = []

        for req in requirements:
            if not req.embeddings_json:
                continue

            try:
                embedding_data = json.loads(req.embeddings_json)
                embeddings = embedding_data.get("embeddings", [])
                chunks = embedding_data.get("chunks", [])

                if not embeddings:
                    continue

                # Calculate cosine similarity
                similarities = []
                for emb in embeddings:
                    similarity = np.dot(query_embedding, emb) / (
                        np.linalg.norm(query_embedding) * np.linalg.norm(emb)
                    )
                    similarities.append(similarity)

                max_similarity = max(similarities) if similarities else 0
                best_chunk_idx = (
                    similarities.index(max_similarity) if similarities else 0
                )
                best_chunk = chunks[best_chunk_idx] if best_chunk_idx < len(chunks) else ""

                results.append(
                    {
                        "req_id": req.id,
                        "requirement_id": req.requirement_id,
                        "raw_text": req.raw_text,
                        "similarity_score": float(max_similarity),
                        "best_chunk": best_chunk,
                    }
                )

            except Exception as e:
                print(f"Error processing requirement {req.id}: {e}")
                continue

        # Sort by similarity and return top_k
        results.sort(key=lambda x: x["similarity_score"], reverse=True)
        top_results = results[: request.top_k]

        return {
            "query": request.query,
            "doc_id": request.doc_id,
            "results": top_results,
            "total_found": len(top_results),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
    finally:
        sess.close()


@router.get("/api/rag/status/{doc_id}")
def get_embedding_status(doc_id: int):
    """Get embedding status for all requirements in a document."""
    sess = get_session()
    try:
        stmt = select(Requirement).where(Requirement.doc_id == doc_id)
        requirements = sess.exec(stmt).all()

        if not requirements:
            raise HTTPException(status_code=404, detail="No requirements found")

        total = len(requirements)
        embedded = sum(1 for r in requirements if r.embeddings_json)

        return {
            "doc_id": doc_id,
            "total_requirements": total,
            "embedded_requirements": embedded,
            "percentage_embedded": round((embedded / total * 100) if total > 0 else 0, 2),
        }

    finally:
        sess.close()
