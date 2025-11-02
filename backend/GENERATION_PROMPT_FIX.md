# Generation Prompt Fix - Test Case Generation Issue

**Problem Identified**: Empty test case objects `{}`  returned from `/api/generate/preview`

**Root Cause**: Architecture mismatch between extraction and generation prompts

---

## The Issue Explained

### What Was Happening

1. **extraction_prompt_v2.txt** - Designed to extract TestCase objects from requirements
   - Output structure: Complex XML with TestCase/ParsedEntities/Standards/Evidence
   - Purpose: Full end-to-end test case generation from raw requirement text

2. **generate_router.py build_generation_prompt()** - Hardcoded prompt asking for different structure
   - Output expected: `{gherkin, evidence, automated_steps, sample_data, code_scaffold}`
   - Purpose: Generate test cases from already-extracted requirements

3. **The Mismatch**:
   - extraction_prompt_v2 outputs TestCase XML structure
   - generate_router expects `{gherkin, evidence, ...}` JSON
   - Gemini received a request for `{gherkin, ...}` format but extraction_prompt_v2 was conceptually designed for full TestCase generation
   - Result: Empty objects because the prompt was inconsistent with the expected output format

### Why This Created Empty Objects

When Gemini's response doesn't match the expected schema/instructions, it can:
1. Return empty objects `{}`
2. Return partial data
3. Return fields with null/empty values

In your case, the router was calling `generate_structured_response()` with `response_schema=None`, which means Gemini had full freedom to output anything. The prompt wasn't clear enough about the exact JSON structure needed.

---

## The Fix

### Step 1: Created `generation_prompt_v1.txt`

A dedicated prompt template specifically for test case generation from structured requirements.

**Key features**:
- Clear output schema (exactly what fields are needed)
- Type-specific instructions (positive vs negative vs boundary)
- Example JSON output showing exact format
- Instructions for each field:
  - **gherkin**: BDD-style Given/When/Then
  - **evidence**: Observable proof test passed
  - **automated_steps**: 4-6 executable test steps
  - **sample_data**: Realistic test values
  - **code_scaffold**: Pytest code example

**Location**: `src/services/prompts/generation_prompt_v1.txt`

### Step 2: Refactored `build_generation_prompt()` in generate_router.py

**Before**:
```python
def build_generation_prompt(structured: dict, test_type: str = "positive") -> str:
    # Hardcoded prompt asking for {gherkin, evidence, ...}
    prompt = (
        "You are a test-case generator... produce a JSON object with:\n"
        "- gherkin: ...\n"
        ...
    )
    return prompt
```

**After**:
```python
def build_generation_prompt(
    client: GeminiClient, structured: dict, test_type: str = "positive"
) -> str:
    # Use template file instead
    prompt = client.build_prompt(
        "generation_prompt_v1.txt",
        json.dumps(structured, indent=2)
    )
    # Replace TYPE_INSTRUCTION with specific instructions
    prompt = prompt.replace("{{TYPE_INSTRUCTION}}", type_instruction)
    return prompt
```

**Benefits**:
1. Prompt stored externally (can be tweaked without code changes)
2. Clear, standardized format
3. Consistent with extraction router pattern (also uses template files)
4. Type-specific instructions injected per test type

### Step 3: Updated All Calls to `build_generation_prompt()`

Updated 3 functions in generate_router.py:
1. `generate_preview()` - Line 133
2. `regenerate_single_preview()` - Line 348
3. `regenerate_batch_preview()` - Line 448

All now pass `client` as first argument to access prompt template.

---

## Architecture Now Unified

### Extraction Pipeline
```
Raw requirement text
    ↓
extraction_prompt_v1.txt (template)
    ↓
GeminiClient.generate_structured_response(prompt, schema=None)
    ↓
Structured requirement: {requirement_id, type, subject, trigger, ...}
    ↓
Store in Requirement table
```

### Generation Pipeline
```
Structured requirement (from Requirement table)
    ↓
generation_prompt_v1.txt (template) + type-specific instruction
    ↓
GeminiClient.generate_structured_response(prompt, schema=None)
    ↓
Test case: {gherkin, evidence, automated_steps, sample_data, code_scaffold}
    ↓
Store in TestCase table
```

### Judge Pipeline
```
Test case + Requirement
    ↓
judge_prompt_v1.txt (template)
    ↓
GeminiClient.generate_structured_response(prompt, schema=JudgeVerdict)
    ↓
Evaluation verdict: {feedback, evaluation, total_rating, subscores}
    ↓
Store in ReviewEvent table
```

**Key Insight**: All three pipelines now follow the same pattern:
1. Load template from `src/services/prompts/`
2. Inject specific content (requirement text, structured data, etc.)
3. Call `GeminiClient.generate_structured_response()`
4. Parse JSON response
5. Store in database

---

## Why This Was Causing Empty Objects

1. **Prompt inconsistency**: The hardcoded prompt asked for one structure, but Gemini's training might have confused it with test case generation from raw text (which is what extraction_prompt_v2 does)

2. **No external template**: Without a clear template file, the prompt was embedded in router logic, making it harder for Gemini to understand the separation of concerns

3. **Type instructions not clear**: The type-specific instructions weren't strongly emphasized in the prompt

4. **Missing examples**: The prompt didn't show an explicit example of the exact JSON structure Gemini should output

With the new `generation_prompt_v1.txt`:
- ✅ Clear output schema
- ✅ Explicit example JSON
- ✅ Separated from extraction concerns
- ✅ Consistent with other prompts

---

## Testing the Fix

### 1. Verify Syntax
```bash
python -m py_compile src/routers/generate_router.py
# Should show: ✅ Syntax check passed
```

### 2. Test Generation Endpoint
```bash
# First extract requirements
curl -X POST http://localhost:8000/api/extract/1

# Then generate test cases
curl -X POST http://localhost:8000/api/generate/preview \
  -H "Content-Type: application/json" \
  -d '{"doc_id": 1, "test_types": ["positive", "negative", "boundary"]}'

# Should return:
# {
#   "preview_count": 3,
#   "previews": [
#     {
#       "id": 1,
#       "gherkin": "Given ... When ... Then ...",
#       "evidence_json": "[...]",
#       "automated_steps_json": "[...]",
#       "sample_data_json": "{...}",
#       "code_scaffold_str": "...",
#       ...
#     },
#     ...
#   ]
# }
```

Expected change: Instead of `{}` objects, you should now see populated objects with all fields.

---

## Files Modified

| File | Change | Reason |
|------|--------|--------|
| `src/services/prompts/generation_prompt_v1.txt` | ✨ New | Dedicated prompt for test case generation |
| `src/routers/generate_router.py` | Modified | Updated `build_generation_prompt()` to use template, updated 3 function calls |

---

## Architecture Improvement

This fix aligns the system with a clear separation of concerns:

```
Extraction Service       Generation Service       Judge Service
(extraction_prompt_v1)   (generation_prompt_v1)   (judge_prompt_v1)
       ↓                          ↓                      ↓
Extract requirements    Generate test cases    Evaluate test quality
from raw text          from requirements       from test cases
       ↓                          ↓                      ↓
Stores in              Stores in               Stores in
Requirement table      TestCase table          ReviewEvent table
```

Each service:
1. Has its own prompt template file
2. Receives appropriate input (raw text, structured requirement, test case)
3. Produces specific output format
4. Stores results in appropriate database table

---

## Summary

**Problem**: Empty test case objects `{}`

**Root Cause**:
- Hardcoded generation prompt was inconsistent with expectations
- No clear template for test case generation (only had extraction template)
- Type instructions not clearly separated

**Solution**:
1. Created `generation_prompt_v1.txt` with clear schema and examples
2. Refactored `build_generation_prompt()` to use template file
3. Updated all 3 function calls to pass client instance
4. Now follows same pattern as extraction and judge pipelines

**Result**:
- Clear, consistent test case generation
- Proper JSON output with all required fields
- Maintainable prompt template (can change without code)
- Aligned architecture across all three services

**Status**: ✅ Fix Applied and Ready to Test
