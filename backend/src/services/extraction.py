# src/services/extraction.py
import os, json, logging
from typing import Dict, Any
from google import genai
from google.genai import types

# env-driven model selection
GENAI_PROJECT = "tcgen-ai"
GENAI_LOCATION = os.environ.get("GENAI_LOCATION", "global")
GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.5-flash-lite")

logger = logging.getLogger("extraction")
logger.setLevel(logging.INFO)

def _build_extraction_prompt(text: str) -> str:
    """
    Prompting convention: instruct the LLM to return strict JSON with fields and per-field confidence.
    Example output:
    {
      "requirement_id": "REQ-AL-045",
      "type": "safety",
      "subject": "oxygen saturation",
      "trigger": {"metric":"spo2","operator":"<","value":90},
      "actions": ["alert","audit_log"],
      "timing_ms": 2000,
      "numbers_units": ["90","%"],
      "field_confidences": {"requirement_id":0.95,"type":0.9,"trigger":0.85,"actions":0.9,"timing_ms":0.8}
    }
    """
    prompt = f"""
You are an extraction system for healthcare software requirements. Given the requirement text, return a strict JSON object (no surrounding text) containing these keys:
- requirement_id (string or null)
- type (one of: safety, privacy, performance, functional, unknown)
- subject (short string describing the subject)
- trigger (object or null) with keys: metric, operator, value
- actions (array of strings)
- timing_ms (number or null)
- numbers_units (array of strings)
- field_confidences: object mapping field names to confidence between 0 and 1 (e.g. "requirement_id": 0.9)
Only return the JSON. Here is the text to analyze:
\"\"\"{text}\"\"\"
"""
    return prompt

def call_vertex_extraction(text: str) -> Dict[str, Any]:
    """
    Call Vertex/GenAI to extract structured JSON. Returns parsed dict.
    Raises RuntimeError if genai not configured.
    """
    # validate config
    if not GENAI_PROJECT:
        raise RuntimeError("GENAI_PROJECT not configured. Set GENAI_PROJECT env var.")

    # initialize client
    client = genai.Client(vertexai=True, project=GENAI_PROJECT, location=GENAI_LOCATION)
    prompt = _build_extraction_prompt(text)
    model = GENAI_MODEL

    logger.info("Calling Vertex model %s for extraction", model)
    resp = client.models.generate_content(model=model, contents=[prompt])
    # response handling: genai returns content in resp.text usually
    text_out = resp.text or ""
    logger.debug("Vertex response: %s", text_out[:1000])

    # parse JSON robustly
    try:
        parsed = json.loads(text_out)
    except Exception as e:
        # try to locate first JSON object in the response
        import re
        m = re.search(r"(\{.*\})", text_out, flags=re.S)
        if m:
            try:
                parsed = json.loads(m.group(1))
            except Exception as e2:
                raise RuntimeError(f"Failed to parse JSON from Vertex response: {e2}; raw: {text_out[:1000]}")
        else:
            raise RuntimeError(f"No JSON found in Vertex response; raw: {text_out[:1000]}")

    # ensure field_confidences exists
    if "field_confidences" not in parsed:
        parsed["field_confidences"] = {}
    # return structured output and raw LLM text for audit
    return {"structured": parsed, "raw": text_out, "model": model}
