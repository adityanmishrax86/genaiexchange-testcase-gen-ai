# src/services/extraction.py
import os, json, logging, re
from typing import Dict, Any, Optional, List
from google import genai
from pydantic import BaseModel, ValidationError
from tenacity import retry, stop_after_attempt, wait_exponential

# --- Configuration ---
GENAI_PROJECT = "tcgen-ai"
GENAI_LOCATION = os.environ.get("GENAI_LOCATION", "global")
GENAI_MODEL = os.environ.get("GENAI_MODEL", "gemini-2.5-flash-lite") # Consider using a slightly more powerful model for CoT
_PROMPT_DIR = os.path.join(os.path.dirname(__file__), "prompts")
logger = logging.getLogger("extraction")
logger.setLevel(logging.DEBUG)

# --- Pydantic Schemas for Validation ---
class Trigger(BaseModel):
    metric: str
    operator: str
    value: int | float | str

class ExtractionResponse(BaseModel):
    requirement_id: Optional[str] = None
    type: str
    subject: str
    trigger: Optional[Trigger] = None
    actions: List[str]
    timing_ms: Optional[int] = None
    numbers_units: List[str]
    field_confidences: Dict[str, float]
    confidence_reasoning: Optional[str] = None

# --- AI Service Code ---
try:
    if GENAI_PROJECT:
        client = genai.Client(vertexai=True, project=GENAI_PROJECT, location=GENAI_LOCATION)
    else:
        client = None
except Exception as e:
    logger.error("Failed to initialize GenAI Client: %s", e)
    client = None

def _build_extraction_prompt(text: str) -> str:
    """
    Reads the prompt template from a file and injects the requirement text.
    """
    try:
        with open(os.path.join(_PROMPT_DIR, "extraction_prompt.txt"), "r") as f:
            prompt_template = f.read()
    except FileNotFoundError:
        logger.error("CRITICAL: extraction_prompt.txt not found in prompts/ directory.")
        raise RuntimeError("Prompt template file not found.")
    
    return prompt_template.replace("{{TEXT_TO_ANALYZE}}", text)


@retry(wait=wait_exponential(multiplier=1, min=2, max=10), stop=stop_after_attempt(3))
def call_vertex_extraction(text: str) -> Dict[str, Any]:
    """
    Calls Vertex/GenAI with a Chain-of-Thought prompt, with retries,
    and validates the response schema.
    """
    if not client:
        raise RuntimeError("GENAI_PROJECT not configured or client failed to initialize.")

    prompt = _build_extraction_prompt(text)
    model = GENAI_MODEL
    
    logger.info("Calling Vertex model %s for extraction", model)
    resp = client.models.generate_content(model=model, contents=[prompt])
    raw = resp.text or ""

    # Robustly find and parse the JSON block from the raw response
    parsed_json = None
    try:
        # The regex is excellent for finding the JSON block after the reasoning
        m = re.search(r"(\{.*\})", raw, flags=re.S)
        if m:
            parsed_json = json.loads(m.group(1))
        else: # Fallback if no JSON is found at all
            raise RuntimeError("No JSON object found in model response.")
    except json.JSONDecodeError as e:
        raise RuntimeError(f"Failed to parse JSON from model response: {e}")

    # Validate the parsed JSON against your Pydantic schema
    try:
        validated_data = ExtractionResponse(**parsed_json)
        return {"structured": validated_data.model_dump(), "raw": raw, "model": model, "error": None}
    except ValidationError as e:
        logger.error("LLM response failed schema validation for text '%s': %s", text[:50], e)
        # Return the broken data so it can be flagged for manual review
        return {"structured": parsed_json, "raw": raw, "model": model, "error": str(e)}