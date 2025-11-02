# Hackathon Integration Checklist

## Backend Implementation Status

### ✅ Core Services
- [x] Document parsing (PDF, XLSX, CSV, TXT)
- [x] LLM extraction (Vertex AI)
- [x] Test case generation (Vertex AI)
- [x] Judge LLM evaluation (Gemini with detailed rubric)
- [x] RAG embeddings (Google embedding model)
- [x] JIRA integration

### ✅ New Routers Created

#### 1. Standards Management Router (`standards_router.py`)
- [x] Upload standards documents (IEC 62304, FDA, ISO, etc.)
- [x] Generate RAG embeddings for standards
- [x] List and retrieve standards
- [x] Delete standards documents

**Endpoints:**
```
POST   /api/standards/upload
GET    /api/standards/list
GET    /api/standards/{standards_id}
DELETE /api/standards/{standards_id}
```

#### 2. Judge Evaluation Router (`judge_router.py`)
- [x] Single test case evaluation
- [x] Batch evaluation
- [x] Detailed rubric scoring (1-4 scale)
- [x] Audit trail recording

**Endpoints:**
```
POST /api/judge/evaluate
POST /api/judge/evaluate-batch
GET  /api/judge/scores/{test_case_id}
```

#### 3. Human Review Router (`human_review_router.py`)
- [x] Get test case review package (test + req + judge verdict)
- [x] Human decision recording (approve/reject/regenerate)
- [x] Batch review decisions
- [x] Pending approval queue
- [x] Complete audit trail

**Endpoints:**
```
GET  /api/review/package/{test_case_id}
POST /api/review/decide
POST /api/review/batch-decide
GET  /api/review/pending-approval
GET  /api/review/audit-trail/{test_case_id}
```

#### 4. RAG Embeddings Router (`rag_router.py`)
- [x] Generate embeddings for requirements
- [x] Semantic search
- [x] Embedding status tracking

**Endpoints:**
```
POST /api/rag/embed
GET  /api/rag/status/{doc_id}
POST /api/rag/search
```

#### 5. Pipeline Router (`pipeline_router.py`)
- [x] One-click workflow start
- [x] Progress tracking
- [x] Auto-approval

**Endpoints:**
```
POST /api/pipeline/start
GET  /api/pipeline/status/{upload_session_id}
POST /api/pipeline/auto-approve/{upload_session_id}
```

#### 6. Enhanced Export Router (`export_router.py`)
- [x] Fixed JIRA integration
- [x] Traceability matrix export

---

## Database Updates

### ✅ Model Changes
- [x] Added `embeddings_json` field to `Requirement` model
- [x] All existing models compatible

---

## Configuration

### Required Environment Variables
```bash
# Existing
GENAI_PROJECT=tcgen-ai
GENAI_LOCATION=global
GENAI_MODEL=gemini-2.5-flash-lite
GEMINI_API_KEY=<your-key>
DATABASE_URL=sqlite:///data.db
UPLOAD_DIR=./uploads

# For JIRA integration
JIRA_BASE_URL_PRAJNA=https://your-jira.atlassian.net
JIRA_API_USER_PRAJNA=user@example.com
JIRA_API_TOKEN_PRAJNA=<your-token>
JIRA_ORG_ID=<org-id>

# For document parsing (optional)
PROJECT_ID=<gcp-project>
PROCESSOR_ID=<doc-ai-processor>
LOCATION=us
```

---

## React Flow Integration

### Node Types to Implement

1. **Upload Node**
   - Input: File selection
   - Output: `doc_id`, `upload_session_id`
   - API: `POST /api/upload` → `POST /api/extract/{doc_id}`

2. **Standards Node** (Optional)
   - Input: Standards file + doc_type
   - Output: `standards_id`
   - API: `POST /api/standards/upload`

3. **Embeddings Node** (Optional)
   - Input: `doc_id`, chunk_size
   - Output: Embedding stats
   - API: `POST /api/rag/embed`

4. **Generate Node**
   - Input: `doc_id`, test_types
   - Output: List of preview test cases
   - API: `POST /api/generate/preview` → `POST /api/generate/confirm`

5. **Judge Node**
   - Input: Test case IDs
   - Output: Evaluation verdicts with scores
   - API: `POST /api/judge/evaluate-batch`

6. **Review Node** (Human-in-the-Loop)
   - Input: Show pending approval queue
   - Interaction: Human approves/rejects/regenerates
   - Output: Decision status
   - API: `GET /api/review/pending-approval` → `POST /api/review/decide`

7. **JIRA Node**
   - Input: JIRA config + approved test case IDs
   - Output: Created issue keys
   - API: `POST /api/export/jira`

---

## Frontend Component Mapping

### Suggested React Flow Components

```
Component                  Maps To Endpoint(s)
─────────────────────────  ──────────────────────────────
FileUploadNode            /api/upload + /api/extract
StandardsUploadNode       /api/standards/upload
EmbeddingsNode            /api/rag/embed
GenerateNode              /api/generate/preview
JudgeNode                 /api/judge/evaluate-batch
ReviewModal               /api/review/package + /api/review/decide
JiraConfigNode            /api/export/jira
ProgressTracker           /api/pipeline/status (polling)
PendingQueuePanel         /api/review/pending-approval
AuditTrailViewer          /api/review/audit-trail
```

---

## Testing Endpoints

### 1. Test Upload → Extract
```bash
# Step 1: Upload file
curl -X POST http://localhost:8000/api/upload \
  -F "file=@requirements.pdf"

# Response: doc_id=1, upload_session_id=uuid

# Step 2: Extract requirements
curl -X POST http://localhost:8000/api/extract/1

# Response: 5 requirements created
```

### 2. Test Standards Upload
```bash
curl -X POST http://localhost:8000/api/standards/upload \
  -F "file=@IEC62304.pdf" \
  -F "doc_type=standard" \
  -F "description=IEC 62304 Software Development"

# Response: standards_id=5, chunks_processed=45
```

### 3. Test Generate & Judge
```bash
# Generate test cases
curl -X POST http://localhost:8000/api/generate/preview \
  -H "Content-Type: application/json" \
  -d '{"doc_id": 1, "test_types": ["positive", "negative", "boundary"]}'

# Evaluate with judge
curl -X POST http://localhost:8000/api/judge/evaluate-batch \
  -H "Content-Type: application/json" \
  -d '{"test_case_ids": [1, 2, 3], "judge_model": "gemini-2.5-pro"}'

# Response: Detailed verdicts with scores
```

### 4. Test Human Review
```bash
# Get review package
curl http://localhost:8000/api/review/package/1

# Make decision
curl -X POST http://localhost:8000/api/review/decide \
  -H "Content-Type: application/json" \
  -d '{
    "test_case_id": 1,
    "decision": "approve",
    "notes": "Good coverage"
  }'
```

### 5. Test JIRA Push
```bash
curl -X POST http://localhost:8000/api/export/jira \
  -H "Content-Type: application/json" \
  -d '{
    "jira_config": {
      "url": "https://your-jira.atlassian.net",
      "project_key": "TCG",
      "username": "user@example.com",
      "api_token": "token"
    },
    "test_case_ids": [1, 2, 3]
  }'

# Response: 3 JIRA issues created
```

---

## API Documentation

Two comprehensive guides provided:

1. **WORKFLOW_API_GUIDE.md** ← Start here!
   - React Flow node architecture
   - Frontend integration examples
   - Complete example workflow
   - Performance notes

2. **API_WORKFLOW.md**
   - All endpoints summary
   - Status tracking
   - Error handling

---

## Deployment Checklist

### Before Hackathon Demo
- [ ] All environment variables configured
- [ ] React Flow nodes wired to API endpoints
- [ ] JIRA credentials working
- [ ] GCP credentials for Vertex AI
- [ ] Standard documents uploaded (optional)
- [ ] Test workflow execution end-to-end
- [ ] Error handling in React Flow UI
- [ ] Progress indication for long-running operations

### Running the Backend
```bash
# Development mode with auto-reload
uvicorn app:app --reload

# Production mode
gunicorn app:app -w 4 -k uvicorn.workers.UvicornWorker
```

### API Documentation
```
http://localhost:8000/docs
```

---

## Key Features for Hackathon

✅ **Workflow Orchestration**
- Frontend (React Flow) drives execution
- No complex backend state machine

✅ **Human-in-the-Loop Review**
- Judge LLM provides detailed rubric scores
- Human QA makes approve/reject/regenerate decisions
- Complete audit trail of all decisions

✅ **Optional Features**
- Standards document upload (for compliance)
- RAG embeddings (for semantic search)
- Auto-approval (for fast-tracking)

✅ **Minimal & Clean**
- 11 new endpoints
- 4 new routers
- Reuses existing services
- Compatible with existing React Flow setup

✅ **Production Ready**
- Error handling
- Audit trails
- Batch operations
- Status tracking

---

## Common Issues & Solutions

### Issue: Judge model not found
**Solution**: Use default "gemini-2.5-pro" or specify in node config

### Issue: JIRA credentials failing
**Solution**: Test with curl first, verify project key exists

### Issue: Embeddings timeout on large documents
**Solution**: Adjust chunk_size in embedding node (smaller = more chunks, longer processing)

### Issue: React Flow nodes not updating
**Solution**: Implement proper state management for node data after API calls

---

## Performance Expectations

| Operation | Time | Notes |
|-----------|------|-------|
| Upload + Extract | 5-20s | Depends on document size |
| Generate previews | 10-30s | 3 types × N requirements |
| Judge evaluation | 15-45s | Batch recommended |
| RAG embedding | 5-20s | Semantic search prep |
| JIRA push | 2-10s | Batch recommended |
| **Total workflow** | **40-120s** | For 5 requirements |

---

## Support

### Troubleshooting Steps
1. Check `/docs` Swagger UI for endpoint details
2. Review audit trails: `GET /api/review/audit-trail/{test_case_id}`
3. Check pending items: `GET /api/review/pending-approval`
4. Verify embeddings: `GET /api/rag/status/{doc_id}`
5. Test endpoints with curl before React Flow integration

### Debug Mode
Add logging to see LLM responses:
```python
import logging
logging.basicConfig(level=logging.DEBUG)
```

---

## Files Modified/Created

### New Files Created:
- `src/services/embeddings.py`
- `src/routers/standards_router.py`
- `src/routers/judge_router.py`
- `src/routers/human_review_router.py`
- `src/routers/rag_router.py`
- `src/routers/pipeline_router.py`
- `src/routers/__init__.py`
- `WORKFLOW_API_GUIDE.md` (This guide!)
- `API_WORKFLOW.md`
- `HACKATHON_INTEGRATION_CHECKLIST.md` (This file)

### Files Modified:
- `app.py` (added new routers)
- `src/models.py` (added embeddings_json field)
- `src/routers/export_router.py` (fixed JIRA integration)

---

## Quick Start for Frontend Developer

1. Read **WORKFLOW_API_GUIDE.md** first
2. Create React Flow nodes for each step
3. Wire nodes to API endpoints (curl examples provided)
4. Implement pending-approval queue for human review
5. Add judge verdict display in review modal
6. Show audit trail after each decision
7. Test complete workflow with demo PDF

**You're ready for the hackathon! 🚀**
