# Workflow-Based Test Case Generator - API Guide for React Flow

## Overview

This backend supports a **workflow orchestration system** where the frontend (React Flow) controls the execution sequence. Each node type in the workflow maps to one or more API endpoints.

---

## Architecture: Frontend-Driven Orchestration

```
React Flow Nodes                API Endpoints
─────────────────              ──────────────

[Upload Docs] ──────────────▶ POST /api/upload
                              POST /api/extract/{doc_id}

[Standards Doc] ─────────────▶ POST /api/standards/upload
(Optional)                     POST /api/rag/embed

[Generate Tests] ────────────▶ POST /api/generate/preview
                              POST /api/generate/confirm

[Judge LLM] ──────────────────▶ POST /api/judge/evaluate
(Evaluates Test Cases)         GET /api/judge/scores/{id}

[Human Review] ───────────────▶ GET /api/review/package/{id}
(Approve/Reject/Regenerate)    POST /api/review/decide

[Push to JIRA] ───────────────▶ POST /api/export/jira
```

---

## Node Types & API Endpoints

### 1. **Document Upload Node**

**React Flow Node Type:** `uploadNode`

Upload requirement documents (PDF, XLSX, CSV, TXT)

```bash
POST /api/upload
Content-Type: multipart/form-data

# Response
{
  "doc_id": 1,
  "filename": "requirements.pdf",
  "upload_session_id": "uuid-session"
}
```

Then extract requirements:

```bash
POST /api/extract/{doc_id}

# Response
{
  "created_requirements": [
    {"id": 1, "requirement_id": "REQ-001", "raw_text": "..."},
    {"id": 2, "requirement_id": "REQ-002", "raw_text": "..."}
  ]
}
```

---

### 2. **Standards/Guidelines Node** (Optional)

**React Flow Node Type:** `standardsNode`

Upload standard guidelines (IEC 62304, FDA, ISO 14971, etc.) and generate embeddings for RAG retrieval.

```bash
POST /api/standards/upload
Content-Type: multipart/form-data

Payload:
{
  "file": <file>,
  "doc_type": "standard",  # or "guideline", "template"
  "description": "IEC 62304 Software Development Safety Standard"
}

# Response
{
  "standards_id": 5,
  "filename": "IEC62304.pdf",
  "chunks_processed": 45,
  "embedding_dimension": 768
}
```

List available standards:

```bash
GET /api/standards/list
GET /api/standards/list?doc_type=standard

# Response
{
  "standards": [
    {
      "standards_id": 5,
      "filename": "IEC62304.pdf",
      "doc_type": "standard",
      "chunks_count": 45,
      "embedding_dimension": 768
    }
  ]
}
```

---

### 3. **Embeddings Node** (Optional, if using standards)

**React Flow Node Type:** `embeddingsNode`

Generate RAG embeddings for requirements (for semantic search during generation).

```bash
POST /api/rag/embed

Payload:
{
  "doc_id": 1,
  "chunk_size": 500
}

# Response
{
  "doc_id": 1,
  "chunks_processed": 12,
  "embedding_dimension": 768,
  "model": "text-embedding-004"
}
```

---

### 4. **Test Case Generation Node**

**React Flow Node Type:** `generateNode`

Generate test case previews (positive, negative, boundary).

```bash
POST /api/generate/preview

Payload:
{
  "doc_id": 1,
  "test_types": ["positive", "negative", "boundary"]
}

# Response
{
  "preview_count": 15,
  "previews": [
    {
      "id": 1,
      "test_case_id": "TC-REQ-001-positive",
      "test_type": "positive",
      "status": "preview",
      "gherkin": "Given... When... Then...",
      "evidence": [...],
      "automated_steps": [...],
      "sample_data": {...}
    },
    ...
  ]
}
```

---

### 5. **Judge LLM Evaluation Node**

**React Flow Node Type:** `judgeNode`

Use judge LLM to evaluate generated test cases with detailed rubric scoring.

```bash
POST /api/judge/evaluate

Payload:
{
  "test_case_id": 1,
  "judge_model": "gemini-2.5-pro"  # Optional override
}

# Response (JudgeVerdict)
{
  "test_case_id": 1,
  "feedback": "Test case is well-structured but lacks boundary testing",
  "evaluation": "The test covers the happy path effectively...",
  "total_rating": 3,  # 1-4 scale
  "correctness_of_trigger": 0.85,
  "timing_and_latency": 0.75,
  "actions_and_priority": 0.90,
  "logging_and_traceability": 0.80,
  "standards_citations": 0.70,  # From uploaded standards
  "boundary_readiness": 0.65,
  "consistency_and_no_hallucination": 0.90,
  "confidence_and_warnings": 0.80,
  "evaluated_at": "2024-11-01T15:30:00Z"
}
```

**Batch evaluation:**

```bash
POST /api/judge/evaluate-batch

Payload:
{
  "test_case_ids": [1, 2, 3, 4, 5],
  "judge_model": "gemini-2.5-pro"
}

# Response
{
  "evaluations": [...],  # List of verdict objects
  "total_evaluated": 5,
  "errors": [],
  "success": true
}
```

---

### 6. **Human Review Node** (Critical!)

**React Flow Node Type:** `reviewNode`

The **human-in-the-loop** decision point. Get test case package with judge scores and decide.

**Get review package (test case + requirement + judge verdict):**

```bash
GET /api/review/package/{test_case_id}

# Response
{
  "test_case_id": 1,
  "test_case": {
    "id": 1,
    "test_case_id": "TC-REQ-001-positive",
    "test_type": "positive",
    "gherkin": "Given...",
    "evidence": [...],
    "code_scaffold": "...",
  },
  "requirement": {
    "id": 1,
    "requirement_id": "REQ-001",
    "raw_text": "If SpO₂ < 88%...",
    "structured": {...},
    "overall_confidence": 0.92
  },
  "judge_verdict": {
    "feedback": "Test case well-structured...",
    "total_rating": 3,
    "correctness_of_trigger": 0.85,
    ...
  }
}
```

**Make human decision:**

```bash
POST /api/review/decide

Payload:
{
  "test_case_id": 1,
  "decision": "approve",  # or "reject" or "regenerate"
  "notes": "Good coverage, approved for JIRA",
  "edits": null,
  "regenerate_reason": null
}

# OR regenerate with optional edits:

Payload:
{
  "test_case_id": 2,
  "decision": "regenerate",
  "edits": {
    "gherkin": "Modified Gherkin scenario..."
  },
  "regenerate_reason": "Need more boundary test cases"
}

# Response
{
  "test_case_id": 1,
  "decision": "approve",
  "status": "generated",
  "regeneration_count": 0,
  "message": "Test case approved by human QA"
}
```

**Get pending approval queue:**

```bash
GET /api/review/pending-approval?doc_id=1&limit=50

# Response
{
  "total_pending": 15,
  "test_cases": [
    {
      "test_case_id": 1,
      "test_case_identifier": "TC-REQ-001-positive",
      "test_type": "positive",
      "status": "preview",
      "requirement_id": "REQ-001",
      "requirement_text": "If SpO₂ < 88%...",
      "gherkin_preview": "Given the system is monitoring SpO₂..."
    },
    ...
  ]
}
```

**Get audit trail (all decisions on a test case):**

```bash
GET /api/review/audit-trail/{test_case_id}

# Response
{
  "test_case_id": 1,
  "audit_trail": [
    {
      "timestamp": "2024-11-01T14:00:00Z",
      "reviewer": "judge-llm",
      "action": "judge_evaluation",
      "note": "Well-structured test case...",
      "confidence": 0.75
    },
    {
      "timestamp": "2024-11-01T14:05:00Z",
      "reviewer": "human-qa",
      "action": "approve",
      "note": "Approved by human",
      "confidence": 1.0
    }
  ]
}
```

---

### 7. **JIRA Push Node**

**React Flow Node Type:** `jiraNode`

Push approved test cases to JIRA.

```bash
POST /api/export/jira

Payload:
{
  "jira_config": {
    "url": "https://your-jira.atlassian.net",
    "project_key": "TCG",
    "username": "user@example.com",
    "api_token": "your-api-token"
  },
  "test_case_ids": [1, 2, 3, 4, 5]
}

# Response
{
  "message": "Success",
  "created_issues_count": 5,
  "issue_keys": ["TCG-101", "TCG-102", "TCG-103", "TCG-104", "TCG-105"]
}
```

---

## Complete Example Workflow

### Step-by-Step Execution Flow

```
1. User uploads requirement file
   POST /api/upload → doc_id=1

2. Extract requirements from document
   POST /api/extract/1 → 5 requirements created

3. (Optional) User uploads IEC 62304 standard
   POST /api/standards/upload → standards_id=5

4. Generate embeddings for requirements
   POST /api/rag/embed → 12 chunks embedded

5. Generate test case previews
   POST /api/generate/preview → 15 test cases (3 types × 5 reqs)

6. Evaluate test cases with judge LLM
   POST /api/judge/evaluate-batch → All 15 evaluated with rubric scores

7. Human QA reviews each test case
   For each test case:
     a) GET /api/review/package/{tc_id} → Shows judge scores
     b) POST /api/review/decide → Approve/Reject/Regenerate

   If regenerate:
     c) POST /api/generate/preview → New previews
     d) POST /api/judge/evaluate → Re-evaluate
     e) Go back to step 7a

8. Push approved test cases to JIRA
   POST /api/export/jira → Creates 12 JIRA issues
```

---

## React Flow Node Configuration

### Node Properties Example

```javascript
// Example node definition for React Flow
{
  id: "upload-1",
  data: {
    label: "Upload Requirement Doc",
    node_type: "upload",
  },
  type: "customNode",
  position: { x: 100, y: 100 },
}

{
  id: "standards-1",
  data: {
    label: "Upload IEC 62304",
    node_type: "standards",
    doc_type: "standard",
  },
  type: "customNode",
  position: { x: 100, y: 250 },
}

{
  id: "generate-1",
  data: {
    label: "Generate Tests",
    node_type: "generate",
    test_types: ["positive", "negative", "boundary"],
  },
  type: "customNode",
  position: { x: 400, y: 100 },
}

{
  id: "judge-1",
  data: {
    label: "Judge LLM Evaluation",
    node_type: "judge",
    judge_model: "gemini-2.5-pro",
  },
  type: "customNode",
  position: { x: 700, y: 100 },
}

{
  id: "review-1",
  data: {
    label: "Human Review",
    node_type: "review",
    show_pending_queue: true,
  },
  type: "customNode",
  position: { x: 1000, y: 100 },
}

{
  id: "jira-1",
  data: {
    label: "Push to JIRA",
    node_type: "jira",
    config: {
      project_key: "TCG",
      url: "https://your-jira.atlassian.net",
    },
  },
  type: "customNode",
  position: { x: 1300, y: 100 },
}
```

---

## Frontend Integration Tips

### 1. **Upload Node Execution**

```javascript
// When user clicks "play" after connecting upload node
async function executeUploadNode(nodeData, file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();
  return { doc_id: data.doc_id, upload_session_id: data.upload_session_id };
}

// Then extract
async function executeExtractNode(doc_id) {
  const response = await fetch(`/api/extract/${doc_id}`, { method: "POST" });
  return await response.json();
}
```

### 2. **Standards Node (Optional)**

```javascript
// User can optionally select a standards document
async function executeStandardsNode(file, docType) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("doc_type", docType);

  return await fetch("/api/standards/upload", {
    method: "POST",
    body: formData,
  }).then(r => r.json());
}
```

### 3. **Generation Node**

```javascript
async function executeGenerateNode(doc_id, testTypes) {
  const response = await fetch("/api/generate/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      doc_id: doc_id,
      test_types: testTypes || ["positive", "negative", "boundary"],
    }),
  });

  const data = await response.json();
  // Show previews to user
  return data.previews;
}
```

### 4. **Judge Node**

```javascript
async function executeJudgeNode(testCaseIds, judgeModel) {
  const response = await fetch("/api/judge/evaluate-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      test_case_ids: testCaseIds,
      judge_model: judgeModel || "gemini-2.5-pro",
    }),
  });

  return await response.json();
}
```

### 5. **Review Node (Human-in-the-Loop)**

```javascript
// Show modal with test case + judge scores
async function showReviewModal(testCaseId) {
  const packageData = await fetch(`/api/review/package/${testCaseId}`)
    .then(r => r.json());

  // Display packageData.test_case, packageData.requirement,
  // packageData.judge_verdict in a modal

  // When user clicks approve/reject/regenerate:
  return await fetch("/api/review/decide", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      test_case_id: testCaseId,
      decision: "approve",  // or "reject", "regenerate"
      notes: "Good coverage",
    }),
  }).then(r => r.json());
}

// Get queue of pending items
async function getPendingApprovalQueue(doc_id) {
  return await fetch(`/api/review/pending-approval?doc_id=${doc_id}`)
    .then(r => r.json());
}
```

### 6. **JIRA Node**

```javascript
async function executeJiraNode(testCaseIds, jiraConfig) {
  const response = await fetch("/api/export/jira", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jira_config: jiraConfig,
      test_case_ids: testCaseIds,
    }),
  });

  const data = await response.json();
  // Show created issue keys to user
  return data.issue_keys;
}
```

---

## Key Characteristics for Hackathon

1. **Minimal node types** → Simple React Flow implementation
2. **Clear data flow** → Each node passes output to next
3. **Human-in-the-loop** → Judge scores guide human decisions
4. **Optional nodes** → Standards/Embeddings are optional
5. **Audit trail** → All decisions tracked automatically
6. **Fast feedback** → Judge LLM evaluates while human decides

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- **200**: Success
- **400**: Bad request (missing fields, invalid input)
- **404**: Resource not found
- **500**: Server error (usually LLM API failure)

**Example error response:**

```json
{
  "detail": "Document not found"
}
```

Handle these in React Flow UI with toast notifications or error overlays.

---

## Performance Notes

- **Judge evaluation**: ~10-30 seconds per test case (parallel via batch endpoint)
- **RAG embedding**: ~5-20 seconds for 50 requirements
- **JIRA push**: ~2-5 seconds per issue

For better UX, show progress bars and allow background processing with status polling.
