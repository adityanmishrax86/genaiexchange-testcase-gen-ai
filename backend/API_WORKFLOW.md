# AI Test Case Generator - API Workflow Guide

## Sequential Pipeline for Hackathon

This guide shows the optimal flow for using the API endpoints in the correct sequence.

---

## **Option 1: Quick Pipeline (Recommended for Hackathon)**

### Single endpoint that handles everything:

```
POST /api/pipeline/start
```

**Request:**
```json
{
  "file": <multipart-file>,
  "test_types": ["positive", "negative", "boundary"]
}
```

**Response:**
```json
{
  "upload_session_id": "uuid-session-123",
  "doc_id": 1,
  "requirements_created": 15,
  "message": "Upload, extraction, and embedding complete..."
}
```

**What it does in one call:**
1. ✅ Uploads document
2. ✅ Extracts text from file
3. ✅ Parses with LLM into requirements
4. ✅ Generates RAG embeddings
5. Ready for manual review or auto-approval

---

## **Option 2: Manual Sequential Flow (For more control)**

### 1. **Upload Document**
```
POST /api/upload
```
- Returns: `doc_id`, `upload_session_id`
- Use `upload_session_id` for tracking

### 2. **Extract Requirements from Document**
```
POST /api/extract/{doc_id}
```
- Extracts text and parses into structured requirements
- Returns: List of created `requirement_id`s

### 3. **Generate RAG Embeddings** (for semantic search)
```
POST /api/rag/embed
```
**Body:**
```json
{
  "doc_id": 1,
  "chunk_size": 500
}
```
- Vectorizes all requirements for semantic search
- Response: `chunks_processed`, `embedding_dimension`

### 4. **Review Requirements** (Manual or Auto-approve)
```
POST /api/review/{requirement_id}
```
OR Auto-approve:
```
POST /api/pipeline/auto-approve/{upload_session_id}
?confidence_threshold=0.7
```

### 5. **Generate Test Cases**
```
POST /api/generate/preview
```
**Body:**
```json
{
  "doc_id": 1,
  "test_types": ["positive", "negative", "boundary"]
}
```

### 6. **Confirm Test Cases**
```
POST /api/generate/confirm
```
**Body:**
```json
{
  "preview_ids": [1, 2, 3],
  "reviewer_confidence": 0.9
}
```

### 7. **Push to JIRA**
```
POST /api/export/jira
```
**Body:**
```json
{
  "jira_config": {
    "url": "https://your-jira.atlassian.net",
    "project_key": "TCG",
    "username": "user@example.com",
    "api_token": "your-token"
  },
  "test_case_ids": [1, 2, 3]
}
```

---

## **Helpful Status & Search Endpoints**

### Get Pipeline Progress
```
GET /api/pipeline/status/{upload_session_id}
```
- Returns: `stage`, `progress` (0-100), `stats`

### Check Embedding Status
```
GET /api/rag/status/{doc_id}
```
- Returns: % of requirements with embeddings

### Semantic Search
```
POST /api/rag/search
```
**Body:**
```json
{
  "doc_id": 1,
  "query": "alert clinician within 2 seconds",
  "top_k": 5
}
```
- Returns: Top matching requirements by similarity

### Export Traceability Matrix
```
GET /api/export/traceability_matrix
?doc_id=1
```
- Returns: CSV download of req → test case mappings

---

## **Frontend UX Assumptions**

1. **One-Click Upload**: Use `/api/pipeline/start` for best UX
   - User uploads file → everything happens in background
   - Show progress bar with `/api/pipeline/status/{session_id}` polling

2. **Auto-Approval Button**: For high-confidence extractions
   - Use `/api/pipeline/auto-approve/{upload_session_id}`
   - Only approve requirements > 0.7 confidence by default

3. **Inline Review & Edit**: Allow manual edits before generation
   - `/api/review/{req_id}` with edits payload
   - Changes update field confidences automatically

4. **Batch Actions**: Regenerate or confirm multiple test cases
   - `/api/generate/regenerate-batch` for bulk regen
   - `/api/generate/confirm` for batch confirmation

5. **Search & Filter**: Use semantic search for large documents
   - `/api/rag/search` to find similar requirements
   - Helps QA teams find related test cases

---

## **Data Flow Diagram**

```
┌─────────────────┐
│   PDF/XLSX      │
│   Document      │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│ Pipeline Start                  │
│ - Upload                        │
│ - Extract Text                  │
│ - Parse → Requirements          │
│ - Generate Embeddings           │
└────────┬────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Review & Approval                │
│ - Auto-approve (high confidence) │
│ - Or manual edit + approve       │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Generate Test Cases              │
│ - Create previews (positive,     │
│   negative, boundary)            │
│ - Confirm/regenerate as needed   │
└────────┬─────────────────────────┘
         │
         ▼
┌──────────────────────────────────┐
│ Export to JIRA                   │
│ - Push test cases as issues      │
│ - Link to requirements           │
└──────────────────────────────────┘
```

---

## **Status Codes & Error Handling**

- **200**: Success
- **207**: Partial success (some JIRA issues created)
- **400**: Bad request (missing required fields)
- **404**: Resource not found
- **500**: Server error (usually LLM API failure)

**For retries:**
- Extraction failures: Auto-retries 3x with exponential backoff
- JIRA push partial failures: Returns created issues + error list
- Embedding: Skips requirements with errors, continues processing

---

## **Best Practices for Hackathon**

1. **Start with pipeline endpoint** → simplest for users
2. **Show progress regularly** → poll status every 2-3 seconds
3. **Auto-approve high-confidence items** → faster workflow
4. **Allow inline edits** → don't require full re-extraction
5. **Batch JIRA pushes** → faster than one-by-one
6. **Export traceability** → audit trail for compliance

---

## **Example: Complete Flow in 3 Requests**

### Request 1: Upload & Process
```bash
curl -X POST http://localhost:8000/api/pipeline/start \
  -F "file=@requirements.pdf"
```
Response: `upload_session_id = "abc123"`

### Request 2: Check Progress
```bash
curl http://localhost:8000/api/pipeline/status/abc123
```
Response: `progress = 85%, stage = "generate"`

### Request 3: Push to JIRA
```bash
curl -X POST http://localhost:8000/api/export/jira \
  -H "Content-Type: application/json" \
  -d '{
    "jira_config": {...},
    "test_case_ids": [1, 2, 3, 4, 5]
  }'
```
Response: `"created_issues_count": 5`

**Total time: ~60-90 seconds for 5-10 requirements**

---

## **Endpoints Summary**

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/pipeline/start` | 🚀 All-in-one: upload → extract → embed |
| GET | `/api/pipeline/status/{id}` | Track progress (0-100%) |
| POST | `/api/pipeline/auto-approve/{id}` | Auto-approve high-confidence reqs |
| POST | `/api/upload` | Upload file only |
| POST | `/api/extract/{doc_id}` | Extract & parse requirements |
| POST | `/api/rag/embed` | Generate embeddings |
| GET | `/api/rag/status/{doc_id}` | Check embedding progress |
| POST | `/api/rag/search` | Semantic search |
| POST | `/api/review/{req_id}` | Review & edit requirement |
| POST | `/api/generate/preview` | Generate test case previews |
| POST | `/api/generate/confirm` | Confirm previews → save |
| POST | `/api/generate/regenerate/{id}` | Regenerate single test case |
| POST | `/api/export/jira` | Push test cases to JIRA |
| GET | `/api/export/traceability_matrix` | Export CSV report |
