# Complete Workflow Execution Guide

This guide explains how the healthcare test case generator workflow operates and how all components work together.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                          │
│  ┌────────┬──────────┬────────┬──────────┬───────┬────────┐     │
│  │ Upload │ Extract  │ Review │ Generate │ Judge │  JIRA  │     │
│  │ Node   │ Node     │ Node   │ Node     │ Node  │  Push  │     │
│  └────────┴──────────┴────────┴──────────┴───────┴────────┘     │
│          ↓              ↓          ↓         ↓        ↓           │
│    API Calls:  POST /upload  POST /extract  POST /judge        │
│               POST /review   POST /generate POST /export/jira   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND (FastAPI)                           │
│  ┌──────────┬──────────┬───────────┬────────┬────────┐           │
│  │ Document │ Extract  │ Generate  │ Judge  │ Export │           │
│  │ Storage  │ Service  │ Service   │Service │Service │           │
│  └──────────┴──────────┴───────────┴────────┴────────┘           │
│        ↓         ↓           ↓          ↓        ↓                │
│  DATABASE  VERTEX AI  VERTEX AI  REST API  JIRA API              │
│  (SQLite)  (Gemini)   (Gemini)   (Gemini)  (JIRA)                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Node Descriptions

### 1. Upload Requirements Node 📤
**Purpose**: Upload requirement documents

**Supported Formats**:
- PDF (.pdf)
- Word Documents (.docx)
- Excel Spreadsheets (.xlsx)
- CSV Files (.csv)
- Plain Text (.txt)

**Process**:
1. Click "Select File" button
2. Choose requirements document
3. File is uploaded to backend
4. Document record created in database
5. Response: `{ doc_id, filename, upload_session_id }`

**Backend**: `POST /api/upload`

---

### 2. Extract Requirements Node 🔍
**Purpose**: Parse requirements and extract structured data

**Process**:
1. Click "Extract Requirements" (requires uploaded document)
2. Backend extracts text from document
3. Splits text into paragraphs
4. For each paragraph:
   - Calls Vertex AI Gemini with extraction prompt
   - Validates JSON response with Pydantic
   - Calculates field-level confidence scores
   - Creates Requirement record
5. Displays extracted requirements with confidence %

**Output Fields** (Structured):
```json
{
  "requirement_id": "REQ-001",
  "type": "functional",
  "subject": "System shall alert on low SpO₂",
  "trigger": {
    "metric": "SpO₂",
    "operator": "<=",
    "value": 88
  },
  "actions": ["alert clinician", "log event"],
  "timing_ms": 2000,
  "numbers_units": ["88", "%"],
  "field_confidences": {
    "requirement_id": 0.95,
    "type": 0.87,
    "subject": 0.92,
    "trigger": 0.85,
    "actions": 0.88,
    "timing_ms": 0.78,
    "numbers_units": 0.91
  },
  "overall_confidence": 0.88
}
```

**Backend**: `POST /api/extract/{doc_id}`

---

### 3. Upload Standards Node (Optional) 📋
**Purpose**: Upload compliance standards documents (IEC-62304, FDA 21 CFR 11, ISO 27001, etc.)

**Only Available When**:
- Toggle "includeStandards" in Settings is ON

**Process**:
Similar to Upload Requirements node, but for standards documents

---

### 4. Review Requirements Node 👤
**Purpose**: Human review and approval of extracted requirements

**Process**:
1. View list of extracted requirements
2. For each requirement:
   - Review raw text and structured JSON
   - Check extraction quality
   - Click "Approve" to mark as approved
3. Only approved requirements can be used for generation

**Status Tracking**:
- Shows "X/N approved" progress
- "Ready to generate test cases" when all approved

**Backend**: `POST /api/review/{req_id}`

---

### 5. Generate Test Cases Node 🤖
**Purpose**: Automatically generate test cases from approved requirements

**Process**:
1. Click "Generate Test Cases"
2. For each approved requirement, backend generates 3 test types:
   - **Positive**: Happy path / normal operation
   - **Negative**: Error conditions / constraint violations
   - **Boundary**: Edge cases and limit conditions
3. Each test case includes:
   - Gherkin scenario (BDD format)
   - Evidence requirements (audit logs, screenshots)
   - Automated steps (code/automation instructions)
   - Sample test data
   - Code scaffold for automation

**Example Generated Test Case**:
```
Scenario: Alert when SpO₂ drops below 88%
  Given a patient with SpO₂ monitoring enabled
  When patient SpO₂ drops below 88%
  Then system SHALL alert clinician within 2 seconds
  And system SHALL log event in audit trail

Evidence Required:
  - Audit log entry with timestamp (±100ms accuracy)
  - Alert message screenshot
  - Database transaction log
```

**Backend**: `POST /api/generate/preview`

---

### 6. Judge Quality Node (Optional) ⚖️
**Purpose**: LLM-as-Judge evaluation of test case quality

**Only Available When**:
- Toggle "includeJudge" in Settings is ON

**Evaluation Criteria** (8-point rubric):
1. **Correctness of Trigger**: Does test correctly validate the trigger condition?
2. **Timing and Latency**: Is timing validation appropriate?
3. **Actions and Priority**: Are required actions properly specified?
4. **Logging and Traceability**: Is audit trail adequately checked?
5. **Standards Citations**: Are standards requirements referenced?
6. **Boundary Readiness**: Does test cover edge cases?
7. **Consistency**: Are test cases logically consistent?
8. **Confidence**: Overall confidence in quality (1-4 scale)

**Output**:
```json
{
  "feedback": "Well-structured test with proper assertions",
  "evaluation": "Tests trigger condition, latency requirement, and audit trail",
  "total_rating": 3.5,
  "correctness_of_trigger": 4,
  "timing_and_latency": 3,
  "actions_and_priority": 4,
  "logging_and_traceability": 3,
  "standards_citations": 2,
  "boundary_readiness": 4,
  "consistency_and_no_hallucination": 3
}
```

**Backend**: `POST /api/judge/evaluate-batch`

---

### 7. Approve Test Cases Node ✅
**Purpose**: Select which test cases to push to JIRA

**Process**:
1. View list of all generated test cases
2. Use checkboxes to select test cases
3. Shows "Ready to push X cases" when selected
4. Selected tests passed to JIRA integration

---

### 8. Push to JIRA Node 🔌
**Purpose**: Export approved test cases to JIRA as issues

**Configuration Required**:
```
JIRA URL: https://your-jira-instance.com
Project Key: TEST (or your project key)
Username: your-jira-username@company.com
API Token: <generate from JIRA settings>
```

**Process**:
1. Enter JIRA configuration
2. Click "Push to JIRA"
3. For each selected test case:
   - Creates JIRA issue of type "Test"
   - Sets title from test case ID
   - Sets description with Gherkin and evidence
   - Links to requirement (if traceability enabled)
4. Returns created issue keys (e.g., TEST-1001, TEST-1002)

**Backend**: `POST /api/export/jira`

---

## Complete End-to-End Data Flow

```
Step 1: Upload
  User uploads "requirements.pdf"
  → Backend creates Document record (doc_id=1)
  → Returns { doc_id: 1, filename: "requirements.pdf" }

Step 2: Extract
  Backend extracts text from PDF → 10 paragraphs
  For each paragraph → Call Vertex AI extraction
  → Creates 10 Requirement records
  → Each with structured JSON + confidence scores
  Returns [Requirement{...}, Requirement{...}, ...]

Step 3: Review
  User sees 10 requirements
  User approves requirements 1-8 (marks status="approved")
  → Creates ReviewEvent records for audit trail
  2 requirements marked as "needs_author" for manual editing

Step 4: Generate
  Backend queries approved requirements (status="approved")
  For each requirement → Calls Vertex AI generation 3× (pos, neg, boundary)
  → Creates 24 TestCase records (8 requirements × 3 types)
  Returns [TestCase{...}, TestCase{...}, ...] with Gherkin + evidence

Step 5: Judge (Optional)
  Backend sends 24 test cases to Judge service
  Judge evaluates each with 8-point rubric
  → Creates GenerationEvent records with verdicts
  Returns [JudgeVerdict{...}, ...] with ratings 1-4

Step 6: Approve
  User sees 24 test cases
  User selects 15 to push (confident they will pass)
  Stores selectedTestCaseIds in context state

Step 7: Push to JIRA
  User enters JIRA credentials
  Backend creates 15 JIRA issues
  Sets title, description, project key, issue type
  → Returns { created_issues_count: 15, issue_keys: [TEST-1001, ...] }
  All testcases marked status="pushed"

Result: 15 test cases visible in JIRA project ✓
```

---

## Workflow Configuration (Optional Features)

### Settings Modal (⚙️ button)

**Option 1: Minimal Workflow** (Default)
- ✓ Upload Requirements
- ✓ Extract Requirements
- ✓ Review Requirements
- ✓ Generate Test Cases
- ✓ Approve Test Cases
- ✓ Push to JIRA

**Option 2: With Standards Compliance**
```
Settings:
  ✓ includeStandards: true
```
Adds:
- ✓ Upload Standards document
- Standards extraction & compliance mapping
- Standards citations in test cases

**Option 3: With Quality Assurance**
```
Settings:
  ✓ includeJudge: true
```
Adds:
- ✓ Judge Quality Evaluation
- 8-point rubric scoring
- Confidence feedback

**Option 4: Full Healthcare Compliance**
```
Settings:
  ✓ includeStandards: true
  ✓ includeJudge: true
```
Full workflow with:
- Standards compliance mapping
- AI quality evaluation
- Complete audit trail
- Healthcare compliance ready

---

## Database Schema

### Core Tables

**document** (uploaded requirements files)
```
- id (PK)
- filename
- uploaded_by
- uploaded_at
- version
- upload_session_id (for versioning)
```

**requirement** (extracted requirements)
```
- id (PK)
- doc_id (FK → document)
- requirement_id (e.g., "REQ-001")
- raw_text (original text from document)
- structured (JSON with extracted fields)
- field_confidences (JSON with per-field confidence)
- overall_confidence (0-1 float)
- status (extracted|in_review|approved|needs_author)
- embeddings_json (vector embeddings for RAG)
- error_message (if extraction failed)
- created_at, updated_at
```

**testcase** (generated test cases)
```
- id (PK)
- requirement_id (FK → requirement)
- test_case_id (e.g., "TC-001-POS")
- gherkin (BDD scenario)
- evidence_json (audit log requirements)
- automated_steps_json (automation steps)
- sample_data_json (test data)
- code_scaffold_str (code template)
- test_type (positive|negative|boundary)
- status (preview|generated|pushed|stale)
- jira_issue_key (e.g., "TEST-1001")
- regeneration_count
```

**reviewevent** (audit trail for reviews)
```
- id (PK)
- requirement_id (FK → requirement)
- reviewer (person name or "system")
- action (approved|rejected|edited)
- note (review comment)
- diffs (what changed)
- reviewer_confidence (0-1)
- timestamp (when reviewed)
```

**generationevent** (audit trail for LLM calls)
```
- id (PK)
- requirement_id (FK → requirement)
- generated_by ("system" or user name)
- model_name (e.g., "gemini-2.5-flash-lite")
- prompt (the actual prompt sent to LLM)
- raw_response (LLM's complete response)
- produced_testcase_ids (JSON list of created test case IDs)
- timestamp (when generated)
```

### Indexes for Performance
```
- requirement.doc_id (find requirements by document)
- requirement.status (find approved/extracted requirements)
- testcase.requirement_id (find test cases by requirement)
- testcase.status (find pushed/stale tests)
- reviewevent.requirement_id (find reviews for requirement)
- generationevent.requirement_id (find generation history)
```

---

## API Endpoints (Complete Reference)

### Upload & Documents
```
POST   /api/upload
       Upload a requirements document
       Returns: { doc_id, filename, upload_session_id }

GET    /api/pipeline/status/{upload_session_id}
       Get progress of pipeline for a session
       Returns: { stage, progress%, stats }
```

### Extraction
```
POST   /api/extract/{doc_id}
       Extract requirements from document
       Returns: { created_requirements: [...] }
```

### Review & Approval
```
POST   /api/review/{req_id}
       Approve/reject a requirement
       Body: { reviewer, review_confidence, action, diffs }

GET    /api/requirements/{req_id}
       Get requirement details
       Returns: { id, structured, confidence, status }
```

### Generation
```
POST   /api/generate/preview
       Generate test cases (preview mode)
       Body: { doc_id, test_types: ["positive", "negative"] }
       Returns: { test_cases: [...] }

POST   /api/generate/confirm
       Confirm and save generated test cases
       Body: { test_case_ids: [...] }
```

### Judge/Quality
```
POST   /api/judge/evaluate-batch
       Evaluate quality of test cases
       Body: { test_case_ids: [...] }
       Returns: { verdicts: [...] }
```

### Export
```
POST   /api/export/jira
       Push test cases to JIRA
       Body: { jira_config, test_case_ids }
       Returns: { created_issues_count, issue_keys }

GET    /api/testcases/{req_id}
       Get test cases for a requirement
       Returns: [TestCase, ...]
```

---

## Error Handling & Recovery

### Common Errors

1. **"No document uploaded"**
   - Solution: Click "Select File" in Upload node first

2. **"Extraction failed"**
   - Check: Is document valid PDF/Excel/CSV?
   - Check: Is GOOGLE_APPLICATION_CREDENTIALS set?
   - Check: Is GCP_PROJECT valid?

3. **"No approved requirements"**
   - Solution: Click "Approve" in Review node for at least one requirement

4. **"Judge evaluation failed"**
   - Check: Is includeJudge toggle enabled?
   - Check: Are there test cases to evaluate?
   - Check: Is GEMINI_API_KEY set?

5. **"JIRA push failed"**
   - Check: JIRA URL is correct
   - Check: Project key exists in JIRA
   - Check: API token is valid and not expired
   - Check: User has permission to create issues

---

## Performance Characteristics

### Extraction
- **Speed**: 5-15 seconds per document (depending on size)
- **Scalability**: Limited by Vertex AI quota (default 60 RPM)

### Generation
- **Speed**: 10-30 seconds per requirement (3 test types)
- **Scalability**: Limited by Vertex AI quota

### Judge Evaluation
- **Speed**: 30-60 seconds per 10 test cases
- **Quality**: 8-point rubric evaluation

### JIRA Push
- **Speed**: 5-10 seconds per test case
- **Bulk**: Can push 100+ cases at once

---

## Monitoring & Debugging

### Frontend Console
```javascript
// Check workflow state
console.log(useWorkflow().state)

// Check API errors
// - useWorkflowApi() error state shows last error message
```

### Backend Logs
```bash
# Enable debug logging
export LOG_LEVEL=DEBUG

# Check extraction service logs
tail -f logs/extraction.log

# Check Vertex AI calls
grep "Calling Vertex" logs/app.log
```

### Database Inspection
```bash
# SQLite (dev)
sqlite3 data.db

# PostgreSQL (prod)
psql -U user -d database -c "SELECT * FROM requirement LIMIT 5;"
```

---

## Next Steps

1. **Configure GCP**:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
   export GCP_PROJECT=your-project
   ```

2. **Start Backend**:
   ```bash
   cd backend
   pip install -r requirements.txt
   alembic upgrade head  # Run migrations
   uvicorn app:app --reload
   ```

3. **Start Frontend**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Test Workflow**:
   - Open http://localhost:5173
   - Upload sample requirements
   - Extract and review
   - Generate and export

5. **Configure Production**:
   - Set up PostgreSQL database
   - Configure OAuth2/JWT authentication
   - Set up monitoring and logging
   - Configure JIRA integration
   - Deploy to Cloud Run

---

## Questions?

Refer to the project CLAUDE.md files:
- Backend architecture: `/backend/CLAUDE.md`
- Frontend architecture: `/frontend/CLAUDE.md`
- Main documentation: `/CLAUDE.md`
