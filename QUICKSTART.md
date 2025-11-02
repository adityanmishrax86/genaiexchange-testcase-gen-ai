# Quick Start Guide - Integrated Workflow

## 30-Second Setup

### Terminal 1: Start Backend
```bash
cd backend
pip install -r requirements.txt
export GENAI_PROJECT=<your-gcp-project-id>
export GOOGLE_APPLICATION_CREDENTIALS=<path-to-service-account.json>
uvicorn app:app --reload
```

### Terminal 2: Start Frontend
```bash
cd frontend
npm install
npm run dev
```

### Open Browser
```
http://localhost:5173
```

---

## Complete Workflow Example

### Step 1: Upload Document
1. Open the app in your browser
2. First node: Click **"Select File"**
3. Choose a PDF, XLSX, CSV, or TXT file with requirements
4. File will upload automatically

### Step 2: Extract Requirements
2nd node: Click **"Extract Requirements"**
- System extracts text and structures requirements
- Shows count of extracted requirements
- Click **"Show Details"** to see individual items with confidence scores

### Step 3: Review & Approve
3rd node: For each requirement:
- Review the text
- Click **"Approve"** button
- Repeat until all requirements are approved
- Shows "Ready to generate test cases" when done

### Step 4: Generate Test Cases
4th node: Click **"Generate Test Cases"**
- Generates 3 types: positive, negative, boundary
- Shows total test cases generated
- Click **"Show Details"** to preview gherkin scenarios

### Step 5: Quality Check (Optional)
5th node (optional): Click **"Evaluate Quality"**
- LLM evaluates test quality
- Shows average score (/4) and verdicts
- Click **"Show Details"** to see individual scores

### Step 6: Approve Test Cases
6th node: Select test cases to push
- Shows all generated test cases
- Check boxes for ones you want in JIRA
- Shows "Ready to push X cases"

### Step 7: Push to JIRA
7th node:
1. Click **"Show JIRA Configuration"**
2. Enter:
   - JIRA URL: `https://your-jira-instance.com`
   - Project Key: `YOUR-PROJECT`
   - Username: `your-email@example.com`
   - API Token: (from your JIRA account)
3. Click **"Push to JIRA"**
4. Shows created issue keys

---

## Troubleshooting Quick Fixes

| Issue | Fix |
|-------|-----|
| "Backend not accessible" | Check backend running on port 8000: `curl http://localhost:8000/docs` |
| "File upload failed" | Ensure file < 10MB, check backend logs |
| "Extraction failed" | Check `GENAI_PROJECT` and GCP credentials are set |
| "No requirements extracted" | Ensure document has readable text |
| "Generation failed" | Check all requirements are approved first |
| "JIRA push failed" | Verify JIRA credentials, check JIRA API token valid |

---

## File Locations

### Frontend Code
- App.tsx - Main component (~370 lines)
- `src/hooks/useWorkflowApi.ts` - All API calls
- `src/context/WorkflowContext.tsx` - State management
- `src/components/WorkflowNodes.tsx` - All 7 node components

### Backend Code
- `app.py` - FastAPI entry point
- `src/routers/` - 10+ API routers
- `src/models.py` - Database models
- `src/services/` - Business logic

### Documentation
- `CLAUDE.md` - Architecture overview
- `INTEGRATION_GUIDE.md` - Full technical details
- `README.md` - Project overview

---

## Environment Variables

### Backend (.env in `backend/`)
```
GENAI_PROJECT=your-gcp-project-id
GENAI_LOCATION=global
GENAI_MODEL=gemini-2.5-flash-lite
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
DATABASE_URL=sqlite:///data.db  # or PostgreSQL for prod
```

### Frontend (.env in `frontend/`)
```
VITE_API_BASE=http://localhost:8000/api
```

---

## What's Different Now

### Before Integration
- Nodes used simulated data (setTimeout delays)
- No real backend connection
- No actual API calls

### After Integration
- **Real API calls** to backend for each step
- **Real data** flowing through nodes
- **Live results** displayed (requirements, test cases, verdicts)
- **Error handling** and retry capability
- **Loading states** during API calls
- **Context-based state** shared across nodes
- **Streamlined UX** - clearer flow, better feedback

---

## Key Components

### WorkflowContext
Manages workflow state:
```typescript
{
  docId: number,
  requirements: [],
  approvedRequirementIds: Set,
  testCases: [],
  judgeVerdicts: [],
  selectedTestCaseIds: Set,
  jiraResult: {...}
}
```

### useWorkflowApi Hook
All API methods:
- `uploadFile(file)`
- `extractRequirements(docId)`
- `approveRequirement(reqId)`
- `generateTestCases(docId, types)`
- `judgeTestCases(testCaseIds)`
- `pushToJira(jiraConfig, testCaseIds)`

### Node Components (7 Total)
1. Upload - File handling
2. Extract - Text parsing
3. Review - Approval workflow
4. Generate - Test creation
5. Judge - Quality evaluation (optional)
6. Approve - Selection UI
7. JIRA Push - Integration

---

## Performance Tips

- **Documents**: <10 MB works best
- **Extraction**: Paragraph-based, slower for large docs
- **Generation**: Each test type = separate API call
- **Judge**: Optional, adds ~30 seconds per batch
- **JIRA**: Batching 50+ tests at once may timeout

---

## Development

### Making Changes

1. **Add API method**: Edit `src/hooks/useWorkflowApi.ts`
2. **Add state**: Edit `src/context/WorkflowContext.tsx`
3. **Update node**: Edit `src/components/WorkflowNodes.tsx`
4. **Test**: npm run dev (hot reload enabled)

### Debugging

- Open browser DevTools: F12 or Cmd+Shift+I
- Check Network tab for API calls
- Check Console for errors
- Backend logs at terminal running uvicorn

---

## Next: Production Deployment

When ready:
1. Add authentication (OAuth2/JWT)
2. Configure production database (PostgreSQL)
3. Set up HTTPS
4. Deploy backend to Cloud Run
5. Deploy frontend to Cloud Storage
6. Update VITE_API_BASE to production URL
7. Configure CORS for production domain

---

## Support

- See `CLAUDE.md` for architecture details
- See `INTEGRATION_GUIDE.md` for deep dive
- Check `backend/README.md` for backend docs
- Check `frontend/README.md` for frontend docs
- FastAPI interactive docs: http://localhost:8000/docs

---

**Ready to test? Follow the "30-Second Setup" above!**
