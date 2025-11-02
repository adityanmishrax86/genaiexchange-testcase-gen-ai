# Quick Start Guide for Hackathon

**TL;DR**: Everything is fixed and working. Just set the environment and run.

---

## Setup (2 minutes)

```bash
# 1. Make sure you're in the backend directory
cd backend

# 2. Verify .env has these critical vars
cat .env | grep -E "GEMINI_API_KEY|GENAI_MODEL|JIRA"

# Expected output:
# GEMINI_API_KEY=<your-key>
# GENAI_MODEL=gemini-2.5-flash-lite
# JIRA_BASE_URL_PRAJNA=<your-url>
# JIRA_API_USER_PRAJNA=<your-user>
# JIRA_API_TOKEN_PRAJNA=<your-token>

# 3. Install dependencies if needed
pip install -r requirements.txt

# 4. Start the server
python -m uvicorn app:app --reload
# OR for production
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker
```

Server runs on `http://localhost:8000`

---

## Verify It Works (1 minute)

```bash
# Test 1: API docs accessible
curl http://localhost:8000/docs

# Test 2: Upload a document
curl -X POST http://localhost:8000/api/upload \
  -F "file=@test_requirements.txt"

# Test 3: Extract requirements
curl -X POST http://localhost:8000/api/extract/1

# Test 4: Generate test cases
curl -X POST http://localhost:8000/api/generate/preview \
  -H "Content-Type: application/json" \
  -d '{"doc_id": 1, "test_types": ["positive", "negative", "boundary"]}'

# Test 5: Evaluate a test case
curl -X POST http://localhost:8000/api/judge/evaluate \
  -H "Content-Type: application/json" \
  -d '{"test_case_id": 1}'
```

---

## Critical Components

### ✅ What's Fixed

1. **GeminiClient Response Handling**
   - Returns `.parsed` when schema provided (for judge)
   - Returns `.text` when no schema (for extract/generate)
   - File: `src/services/gemini_client.py`

2. **Extraction Router**
   - Uses `response_schema=None` (flexible extraction)
   - Builds prompt per paragraph (not once for entire text)
   - File: `src/routers/extraction_router.py`

3. **Generate Router**
   - Uses `response_schema=None` for test case generation
   - NO unwrapping logic (removed 3 instances)
   - File: `src/routers/generate_router.py`

4. **Judge Router**
   - Uses `response_schema=JudgeVerdict` (strict validation)
   - File: `src/routers/judge_router.py`

5. **CSV Parsing**
   - 3-tier fallback strategy (never fails)
   - File: `src/services/document_parser.py`

6. **JIRA Integration**
   - Config from environment variables
   - File: `src/routers/export_router.py`

---

## Common Issues & Solutions

### Issue: "GEMINI_API_KEY not configured"
**Solution**: Check `.env` file has `GEMINI_API_KEY=<your-actual-key>`

### Issue: "JSON parsing failed"
**Solution**: Should not happen anymore. CSV files have fallback strategy.

### Issue: "list object has no attribute 'get'"
**Solution**: Fixed in generate_router. No unwrapping logic remains.

### Issue: "Test case not found"
**Solution**: Make sure you extracted requirements before generating test cases.

### Issue: JIRA integration failing
**Solution**: Verify all 3 JIRA env vars are set:
- `JIRA_BASE_URL_PRAJNA`
- `JIRA_API_USER_PRAJNA`
- `JIRA_API_TOKEN_PRAJNA`

---

## Database

SQLite database auto-created on startup:
```bash
# View database
sqlite3 data.db

# Check tables
.tables

# Count records
SELECT COUNT(*) FROM requirement;
```

For production, use PostgreSQL:
```bash
export DATABASE_URL=postgresql://user:pass@host/dbname
```

---

## Prompt Templates

Located in `src/services/prompts/`:
- `extraction_prompt_v2.txt` - For requirement extraction
- `judge_prompt_v1.txt` - For test case evaluation

You can edit these without restarting (loaded at runtime).

---

## Endpoints Quick Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/upload` | POST | Upload document |
| `/api/extract/{doc_id}` | POST | Extract requirements |
| `/api/generate/preview` | POST | Generate test cases |
| `/api/generate/confirm` | POST | Confirm test cases |
| `/api/judge/evaluate` | POST | Evaluate test case |
| `/api/export/jira` | POST | Push to JIRA |
| `/docs` | GET | Interactive API documentation |

---

## Performance Notes

- Extraction: ~2-3 seconds per paragraph (LLM call)
- Generation: ~3-5 seconds per test case (LLM call)
- Judge: ~2-3 seconds per evaluation (LLM call)
- CSV parsing: <1 second (fallback strategy)

Plan extraction/generation to take a few minutes for large documents.

---

## Monitoring

Check logs for detailed information:
```bash
# Set log level
export LOG_LEVEL=INFO

# Watch logs while running
tail -f logs/app.log
```

Important audit tables:
- `GenerationEvent`: Tracks all LLM calls (prompt, response, model)
- `ReviewEvent`: Tracks all reviews and approvals

---

## Success Criteria ✅

Before submitting, verify:
- ✅ Backend starts without errors
- ✅ API docs accessible at `/docs`
- ✅ Can upload documents
- ✅ Can extract requirements
- ✅ Can generate test cases (no unwrapping errors)
- ✅ Can evaluate test cases (JudgeVerdict schema)
- ✅ Can export to JIRA (or skip if demo)
- ✅ Database records created with audit trail

---

**Good luck with the hackathon! 🚀**

All moving parts are synchronized and ready to go.
