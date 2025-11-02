# Backend-Frontend Integration Guide

## Overview

This guide walks through the integration of backend APIs with the React frontend workflow. The application now features a complete end-to-end workflow with real API calls instead of simulated data.

## What Changed

### Backend
- **No changes required** - All necessary endpoints already exist:
  - `/api/upload` - Document upload
  - `/api/extract/{doc_id}` - Requirement extraction
  - `/api/review/{req_id}` - Requirement approval
  - `/api/generate/preview` - Test case generation
  - `/api/judge/evaluate-batch` - Quality evaluation
  - `/api/export/jira` - JIRA integration

### Frontend

#### New Files Created
1. **`frontend/src/hooks/useWorkflowApi.ts`**
   - Custom React hook for all backend API calls
   - Type-safe request/response handling
   - Built-in error handling and loading states
   - Centralizes API communication

2. **`frontend/src/context/WorkflowContext.tsx`**
   - Global state management for the workflow
   - Tracks workflow data across all nodes
   - Provides context hooks for components
   - Manages: requirements, test cases, judge verdicts, selections

3. **`frontend/src/components/WorkflowNodes.tsx`**
   - 7 new pre-built workflow node components:
     - `UploadNodeComponent` - File upload with real API
     - `ExtractNodeComponent` - Requirement extraction
     - `ReviewNodeComponent` - Requirement approval
     - `GenerateNodeComponent` - Test case generation
     - `JudgeNodeComponent` - Quality evaluation (optional)
     - `ApproveNodeComponent` - Test case selection
     - `JiraPushNodeComponent` - JIRA push

4. **`frontend/src/App.tsx`** (Refactored)
   - Reduced from 1814 lines to ~370 lines
   - Cleaner, more maintainable code
   - Uses WorkflowProvider for state management
   - Pre-configured default workflow
   - Real-time metrics dashboard

#### Modified Files
- **`frontend/.env.example`** - Added helpful comments for configuration

## Workflow Architecture

### Data Flow

```
Upload Document
    ↓ (doc_id, filename)
Extract Requirements
    ↓ (requirements[], count)
Review & Approve Requirements
    ↓ (approved_count)
Generate Test Cases
    ↓ (test_cases[], count)
Judge Quality (Optional)
    ↓ (verdicts[], avg_score)
Approve Test Cases
    ↓ (selected_test_case_ids[])
Push to JIRA
    ↓ (created_issues[], success)
```

### State Management

The `WorkflowContext` maintains a single source of truth for all workflow data:

```typescript
interface WorkflowState {
  // Upload step
  docId: number | null;
  filename: string | null;

  // Extract step
  requirements: ExtractedRequirement[];

  // Review step
  approvedRequirementIds: Set<number>;

  // Generate step
  testCases: GeneratedTestCase[];

  // Judge step
  judgeVerdicts: JudgeVerdict[];

  // Approve step
  selectedTestCaseIds: Set<number>;

  // JIRA step
  jiraResult: { created_issues_count, issue_keys[] } | null;
}
```

## Running the Integration

### Prerequisites

1. **Backend Running**
   ```bash
   cd backend
   pip install -r requirements.txt
   uvicorn app:app --reload
   ```
   Backend should be accessible at `http://localhost:8000`

2. **Environment Configuration**
   ```bash
   cd frontend
   cp .env.example .env
   # .env already has correct defaults for local development
   ```

3. **Frontend Dependencies**
   ```bash
   npm install
   ```

### Running the Application

#### Development Mode
```bash
# Terminal 1 - Backend
cd backend
uvicorn app:app --reload

# Terminal 2 - Frontend
cd frontend
npm run dev
```

Access the application at `http://localhost:5173`

#### Production Build
```bash
cd frontend
npm run build
npm run serve
```

## Key Features

### 1. Real-Time Data Display
Each node displays real results from backend API calls:
- **Upload Node**: Shows uploaded filename and document ID
- **Extract Node**: Shows extracted requirements with confidence scores in a table
- **Review Node**: Shows requirement list with approval checkboxes
- **Generate Node**: Shows test case count and sample gherkin scenarios
- **Judge Node**: Shows quality verdicts with scores
- **Approve Node**: Shows test cases with selection checkboxes
- **JIRA Push Node**: Shows created JIRA issue keys

### 2. Error Handling
- Try-catch blocks at each node level
- User-friendly error messages
- Retry capabilities for failed operations
- Validation before proceeding to next step

### 3. Loading States
- Loading indicators while API calls are in progress
- Disabled buttons to prevent duplicate submissions
- Progress animation on nodes

### 4. Metrics Dashboard
Real-time updates showing:
- Requirements extracted count
- Test cases generated count
- Quality verdicts count
- JIRA issues pushed count

### 5. Configurable Workflow
Optional features can be toggled via Settings (⚙️):
- Include Standards Compliance node (future)
- Include Judge Quality evaluation node

## API Integration Details

### Upload Node
```typescript
// Calls: POST /api/upload
// Sends: FormData with file
// Returns: { doc_id, filename, upload_session_id }
```

### Extract Node
```typescript
// Calls: POST /api/extract/{doc_id}
// Returns: { created_requirements: [...] }
// Each requirement has: id, raw_text, structured, overall_confidence
```

### Review Node
```typescript
// Calls: POST /api/review/{req_id}
// Payload: { reviewer, review_confidence, note, edits }
// Returns: { req_id, status, diffs, field_confidences }
```

### Generate Node
```typescript
// Calls: POST /api/generate/preview
// Payload: { doc_id, test_types: ["positive", "negative", "boundary"] }
// Returns: { test_cases: [...] }
// Each test case has: id, test_case_id, gherkin, test_type
```

### Judge Node
```typescript
// Calls: POST /api/judge/evaluate-batch
// Payload: { test_case_ids: [...] }
// Returns: { verdicts: [...] }
// Each verdict has: test_case_id, total_rating, feedback, scores
```

### JIRA Push Node
```typescript
// Calls: POST /api/export/jira
// Payload: { jira_config: { url, project_key, api_token, username }, test_case_ids: [...] }
// Returns: { message, created_issues_count, issue_keys: [...] }
```

## Troubleshooting

### "No document uploaded" Error
- Make sure to upload a file in the Upload node first
- Check that the backend `/api/upload` endpoint is responding

### "Extraction failed" Error
- Verify the document was uploaded (check backend logs)
- Ensure backend has Vertex AI credentials configured
- Check `GENAI_PROJECT` and `GENAI_MODEL` environment variables

### "No approved requirements" Error
- After extracting requirements, move to Review node
- Click "Approve" on each requirement to approve them
- All requirements must be approved before generating tests

### "No test cases to judge" Error
- Ensure test cases were generated successfully
- Check that Generate node ran before Judge node

### "JIRA credentials required" Error
- In the JIRA Push node, click "Show JIRA Configuration"
- Enter valid JIRA credentials (username and API token)
- Token should be from your JIRA account settings

### API Connection Issues
- Verify backend is running: `curl http://localhost:8000/docs`
- Check CORS headers in backend - frontend origins should be allowed
- Verify `VITE_API_BASE` environment variable is correct
- Check browser console for detailed error messages

## Development Workflow

### Adding a New Feature

1. **Add backend endpoint** (if needed) in `backend/src/routers/`
2. **Add API hook method** in `frontend/src/hooks/useWorkflowApi.ts`
3. **Add context management** in `frontend/src/context/WorkflowContext.tsx`
4. **Create/update node component** in `frontend/src/components/WorkflowNodes.tsx`
5. **Update App.tsx** if needed to handle new node type
6. **Test end-to-end** locally

### Modifying Existing Nodes

All node components follow this pattern:
```typescript
const NodeComponent = ({ data, isConnectable }) => {
  const { apiMethod, isLoading, error, clearError } = useWorkflowApi();
  const { state, setState } = useWorkflow();

  const handleAction = async () => {
    clearError();
    const result = await apiMethod(...);
    if (result) {
      setState(result);
      if (data.onProcessed) data.onProcessed(result);
    }
  };

  return (
    <div className="...">
      {/* Node UI */}
    </div>
  );
};
```

## Testing Checklist

- [ ] Backend is running and accessible at http://localhost:8000/docs
- [ ] Frontend environment file is configured with correct API base
- [ ] Upload a test file (PDF, XLSX, CSV, or TXT)
- [ ] Verify requirements are extracted with confidence scores
- [ ] Approve at least one requirement
- [ ] Generate test cases
- [ ] View generated test cases in the Generate node
- [ ] (Optional) Run Judge node to evaluate quality
- [ ] Select test cases in Approve node
- [ ] Configure JIRA credentials
- [ ] Push test cases to JIRA
- [ ] Verify JIRA issues were created

## Performance Considerations

1. **Large Documents**: Extraction works on paragraph level, so very large documents may take time
2. **Test Generation**: Generating multiple test types (positive, negative, boundary) multiplies API calls
3. **Judge Evaluation**: Optional - skip if not needed for faster workflow
4. **Metrics Updates**: Dashboard updates in real-time without extra API calls

## Next Steps

1. **Test the integration** with real documents
2. **Configure JIRA integration** with actual JIRA instance
3. **Add authentication** (OAuth2/JWT) before production
4. **Monitor performance** with large document sets
5. **Collect user feedback** on UX/workflow
6. **Add logging/analytics** for usage tracking
7. **Implement retry logic** for failed API calls
8. **Add progress indicators** for long-running operations

## Code Quality Notes

- All TypeScript types are strict
- Error handling is comprehensive
- Loading states prevent race conditions
- Component props are well-documented
- Hooks follow React best practices
- Context avoids prop drilling
- API calls are centralized and testable

## Questions or Issues?

Refer to:
1. `CLAUDE.md` - High-level architecture documentation
2. `README.md` - Project overview
3. `backend/README.md` - Backend-specific docs
4. `frontend/README.md` - Frontend-specific docs
5. Backend FastAPI docs at `http://localhost:8000/docs`
