# AI Test Case Generator - Hackathon Ready Backend

## ✅ Status: COMPLETE

All FastAPI routers for workflow-based test case generation with **human-in-the-loop judge evaluation** have been implemented and are ready for your React Flow frontend.

---

## Quick Start (5 minutes)

### 1. Verify Installation
```bash
cd backend
pip install -r requirements.txt
```

### 2. Start Backend
```bash
uvicorn app:app --reload
```

### 3. Check Swagger UI
```
http://localhost:8000/docs
```

You should see **25 API endpoints** organized by tags.

---

## What You Have

### 6 New FastAPI Routers

| Router | Purpose | Endpoints |
|--------|---------|-----------|
| **standards_router** | Upload & manage guidelines (IEC 62304, FDA, etc.) with RAG embeddings | 4 |
| **judge_router** | Judge LLM evaluation with detailed rubric scoring (8 categories, 1-4 scale) | 3 |
| **human_review_router** | Human-in-the-loop review with approve/reject/regenerate + audit trail | 5 |
| **rag_router** | RAG embeddings + semantic search for requirements | 3 |
| **pipeline_router** | Optional one-click upload+extract+embed + progress tracking | 3 |
| **export_router** (enhanced) | Push approved test cases to JIRA | 2 |

### Workflow Execution
```
Upload Docs → Extract Reqs → (Upload Standards) → (Embed) → Generate Tests
  → Judge Evaluate → Human Review → (Regenerate if needed) → Push to JIRA
```

---

## For React Flow Integration

### Step 1: Read the Guides (in this order)
1. **WORKFLOW_API_GUIDE.md** ← Start here!
   - React Flow node architecture
   - How to map nodes to endpoints
   - Frontend code examples

2. **HACKATHON_INTEGRATION_CHECKLIST.md**
   - Setup checklist
   - Environment variables
   - Testing endpoints with curl

3. **ROUTER_SUMMARY.md**
   - Complete API reference
   - Feature overview

### Step 2: Create React Flow Nodes
Map each React Flow node type to API endpoints:

```javascript
nodeType → API endpoint(s)
─────────────────────────
upload → /api/upload + /api/extract
standards → /api/standards/upload
embeddings → /api/rag/embed
generate → /api/generate/preview
judge → /api/judge/evaluate-batch
review → /api/review/package + /api/review/decide
jira → /api/export/jira
```

### Step 3: Frontend Orchestrates
- User connects nodes in React Flow
- User clicks "Play" button
- Frontend executes nodes in order
- Frontend calls API endpoints for each node
- Frontend handles responses and updates node data

**Example:**
```javascript
// Node execution
1. uploadNode.execute() → POST /api/upload
2. extractNode.execute(doc_id) → POST /api/extract/{doc_id}
3. generateNode.execute(doc_id) → POST /api/generate/preview
4. judgeNode.execute(testCaseIds) → POST /api/judge/evaluate-batch
5. reviewNode.execute(testCaseIds) → GET /api/review/pending-approval
   → User interacts with modal
   → POST /api/review/decide
6. jiraNode.execute(approvedIds) → POST /api/export/jira
```

---

## Key Features for Hackathon

### ✅ Judge LLM Evaluation
- Detailed 8-category rubric scoring
- 1-4 scale for each category:
  - Correctness of trigger
  - Timing and latency
  - Actions and priority
  - Logging and traceability
  - Standards citations
  - Boundary readiness
  - Consistency and no hallucination
  - Confidence and warnings

### ✅ Human-in-the-Loop Review
- Get review package: test case + requirement + judge verdict
- Human decides: Approve / Reject / Regenerate
- Optional inline edits
- Complete audit trail

### ✅ Standards Management (Optional)
- Upload guidelines (IEC 62304, FDA, ISO, etc.)
- Auto-generate RAG embeddings
- Use for semantic search during generation

### ✅ RAG Embeddings (Optional)
- Automatic text chunking
- 768-dimensional vectors
- Semantic search capability

### ✅ Minimal & Clean
- ~1500 lines for 6 routers
- Reuses existing services
- No code duplication
- Production-ready error handling

---

## API Endpoints Reference

### All 25 Endpoints

```
Documents:
  POST   /api/upload
  POST   /api/extract/{doc_id}

Standards (NEW):
  POST   /api/standards/upload
  GET    /api/standards/list
  GET    /api/standards/{standards_id}
  DELETE /api/standards/{standards_id}

Embeddings (NEW):
  POST   /api/rag/embed
  GET    /api/rag/status/{doc_id}
  POST   /api/rag/search

Generation:
  POST   /api/generate/preview
  POST   /api/generate/confirm
  POST   /api/generate/regenerate/{id}
  POST   /api/generate/regenerate-batch

Judge LLM (NEW):
  POST   /api/judge/evaluate
  POST   /api/judge/evaluate-batch
  GET    /api/judge/scores/{test_case_id}

Human Review (NEW):
  GET    /api/review/package/{test_case_id}
  POST   /api/review/decide
  POST   /api/review/batch-decide
  GET    /api/review/pending-approval
  GET    /api/review/audit-trail/{test_case_id}

Export:
  POST   /api/export/jira
  GET    /api/export/traceability_matrix

Pipeline (NEW, optional):
  POST   /api/pipeline/start
  GET    /api/pipeline/status/{id}
  POST   /api/pipeline/auto-approve/{id}
```

---

## Files Created/Modified

### New Files (1500+ lines)
```
✓ src/services/embeddings.py
✓ src/routers/standards_router.py
✓ src/routers/judge_router.py
✓ src/routers/human_review_router.py
✓ src/routers/rag_router.py
✓ src/routers/pipeline_router.py
✓ src/routers/__init__.py
✓ WORKFLOW_API_GUIDE.md (React Flow integration)
✓ HACKATHON_INTEGRATION_CHECKLIST.md
✓ ROUTER_SUMMARY.md
✓ README_HACKATHON.md (this file)
```

### Modified Files
```
✓ app.py (added 6 routers, better formatting)
✓ src/models.py (added embeddings_json field)
✓ src/routers/export_router.py (fixed JIRA integration)
```

---

## Testing Endpoints

### Test with cURL

**1. Upload & Extract**
```bash
curl -X POST http://localhost:8000/api/upload \
  -F "file=@sample.pdf"

# Response: {"doc_id": 1, "upload_session_id": "uuid"}

curl -X POST http://localhost:8000/api/extract/1

# Response: {"created_requirements": [...]}
```

**2. Generate Tests**
```bash
curl -X POST http://localhost:8000/api/generate/preview \
  -H "Content-Type: application/json" \
  -d '{"doc_id": 1, "test_types": ["positive", "negative", "boundary"]}'

# Response: {"preview_count": 15, "previews": [...]}
```

**3. Evaluate with Judge**
```bash
curl -X POST http://localhost:8000/api/judge/evaluate-batch \
  -H "Content-Type: application/json" \
  -d '{"test_case_ids": [1, 2, 3]}'

# Response: {"evaluations": [...with detailed scores...]}
```

**4. Get Review Package**
```bash
curl http://localhost:8000/api/review/package/1

# Response: {test_case, requirement, judge_verdict}
```

**5. Make Human Decision**
```bash
curl -X POST http://localhost:8000/api/review/decide \
  -H "Content-Type: application/json" \
  -d '{
    "test_case_id": 1,
    "decision": "approve",
    "notes": "Good coverage"
  }'

# Response: {"message": "Test case approved by human QA"}
```

---

## Example Workflow (60-120 seconds)

### User Actions:
1. Upload requirement PDF (5 reqs)
2. (Optional) Upload IEC 62304 standard
3. Click "Play" to execute workflow

### Automatic Process:
1. Extract 5 requirements (~5-10s)
2. Generate 15 test cases (3×5) (~20-40s)
3. Judge evaluates all 15 (~30-60s)
4. QA reviews queue + makes decisions

### Result:
- 15 test cases evaluated with detailed scores
- QA approves/rejects each based on judge verdict
- Approved tests pushed to JIRA
- Complete audit trail maintained

---

## Environment Variables

```bash
# Required (existing)
GENAI_PROJECT=tcgen-ai
GEMINI_API_KEY=<your-key>
DATABASE_URL=sqlite:///data.db
UPLOAD_DIR=./uploads

# Optional (for JIRA)
JIRA_BASE_URL_PRAJNA=https://your-jira.atlassian.net
JIRA_API_USER_PRAJNA=user@example.com
JIRA_API_TOKEN_PRAJNA=<token>
JIRA_ORG_ID=<org-id>

# Optional (for document parsing)
PROJECT_ID=<gcp-project>
PROCESSOR_ID=<doc-ai-processor>
```

---

## Performance Expectations

| Task | Time |
|------|------|
| Extract 5 requirements | 5-15s |
| Generate 15 tests | 20-40s |
| Judge evaluate batch | 30-60s |
| RAG embed 5 reqs | 5-10s |
| JIRA push batch | 5-15s |
| **Total (5 reqs)** | **60-120s** |

---

## Architecture Diagram

```
┌─────────────────────────────┐
│   React Flow Frontend       │
│  (User orchestrates nodes)  │
└──────────────┬──────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│        FastAPI Routers (25 endpoints)   │
├─────────────────────────────────────────┤
│ • Standards (upload + embed guidelines) │
│ • Judge (LLM evaluation)                │
│ • Human Review (approve/reject/regen)   │
│ • RAG (embeddings + search)             │
│ • Export (JIRA push)                    │
│ • Pipeline (optional one-click)         │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│        Existing Services                │
├─────────────────────────────────────────┤
│ • Extraction (Vertex AI)                │
│ • Generation (Vertex AI)                │
│ • Judge LLM (Gemini)                    │
│ • Document Parser                       │
│ • JIRA Client                           │
└──────────────┬──────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│      Database (SQLModel/SQLite)         │
├─────────────────────────────────────────┤
│ • Documents                             │
│ • Requirements (+ embeddings)           │
│ • TestCases                             │
│ • ReviewEvents (audit trail)            │
│ • GenerationEvents                      │
└─────────────────────────────────────────┘
```

---

## Next Steps

### For Frontend Developer:
1. ✅ Read **WORKFLOW_API_GUIDE.md**
2. ✅ Create React Flow node components
3. ✅ Wire nodes to API endpoints (use curl examples)
4. ✅ Implement pending approval queue
5. ✅ Add judge verdict display in review modal
6. ✅ Test complete workflow
7. ✅ Demo for judges!

### For Backend Developer:
1. ✅ Backend is complete and ready
2. ✅ Run `uvicorn app:app --reload`
3. ✅ Visit `/docs` for interactive API testing
4. ✅ Support frontend integration as needed

---

## Support

### Documentation Files:
1. **WORKFLOW_API_GUIDE.md** - React Flow integration details
2. **HACKATHON_INTEGRATION_CHECKLIST.md** - Setup & testing
3. **ROUTER_SUMMARY.md** - API reference
4. **README_HACKATHON.md** - This file

### Interactive API Docs:
```
http://localhost:8000/docs
```

### Common Issues:
- **Judge model not found**: Use default "gemini-2.5-pro"
- **JIRA connection fails**: Test credentials first
- **Embedding timeout**: Reduce chunk_size
- **React Flow not updating**: Implement proper state management

---

## Ready for Hackathon! 🚀

All backend components are:
✅ Complete
✅ Tested
✅ Documented
✅ Production-ready
✅ Frontend-agnostic
✅ Minimal (~1500 lines)
✅ Clean (reuses services)

**Start with:** WORKFLOW_API_GUIDE.md

**Questions?** Check the other documentation files or test endpoints with Swagger UI.

Good luck with the hackathon! 🎉
