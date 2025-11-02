"""Minimal RAG embeddings service using Google Generative AI."""
import os
import json
import logging
from typing import List, Dict, Any, Optional
from google import genai

logger = logging.getLogger("embeddings")
logger.setLevel(logging.DEBUG)

GENAI_PROJECT = os.environ.get("GENAI_PROJECT", "tcgen-ai")
GENAI_LOCATION = os.environ.get("GENAI_LOCATION", "global")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "text-embedding-004")

try:
    client = genai.Client(vertexai=True, project=GENAI_PROJECT, location=GENAI_LOCATION)
except Exception as e:
    logger.error(f"Failed to initialize GenAI Client for embeddings: {e}")
    client = None


def generate_embeddings(texts: List[str]) -> Dict[str, Any]:
    """
    Generate embeddings for a list of text strings using Google's embedding model.

    Args:
        texts: List of text strings to embed

    Returns:
        Dict with embeddings and metadata
    """
    if not client:
        raise RuntimeError("GenAI client not configured for embeddings")

    if not texts:
        return {"embeddings": [], "texts": [], "model": EMBEDDING_MODEL}

    try:
        response = client.models.embed_content(
            model=EMBEDDING_MODEL, contents=texts
        )

        embeddings = [item.embedding for item in response.embeddings]

        return {
            "embeddings": embeddings,
            "texts": texts,
            "model": EMBEDDING_MODEL,
            "embedding_dimension": len(embeddings[0]) if embeddings else 0,
        }
    except Exception as e:
        logger.error(f"Failed to generate embeddings: {e}")
        raise RuntimeError(f"Embedding generation failed: {e}")


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> List[str]:
    """
    Split text into overlapping chunks for embedding.

    Args:
        text: Text to chunk
        chunk_size: Approximate size of each chunk
        overlap: Overlap between chunks

    Returns:
        List of text chunks
    """
    words = text.split()
    chunks = []
    current_chunk = []
    current_size = 0

    for word in words:
        current_chunk.append(word)
        current_size += len(word) + 1

        if current_size >= chunk_size:
            chunks.append(" ".join(current_chunk))
            # Keep last few words for overlap
            current_chunk = current_chunk[-(overlap // 5) :]
            current_size = sum(len(w) + 1 for w in current_chunk)

    if current_chunk:
        chunks.append(" ".join(current_chunk))

    return [c for c in chunks if c.strip()]
