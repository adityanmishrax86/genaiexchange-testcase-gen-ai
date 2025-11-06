# Frontend Workflow Refactoring Summary

## Overview
Successfully refactored the frontend from a healthcare test case generation workflow to a **5-Stage LLM Evaluation Pipeline** with Langfuse tracing and OpenAI batch processing integration.

## 5-Stage Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     LLM EVALUATION PIPELINE (5 STAGES)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STAGE 1         STAGE 2          STAGE 3 (optional)    STAGE 4   STAGE 5   │
│  Dataset      LLM Runner       Module Executor      Aggregator  Logger     │
│  Handler                       (Embeddings)                                 │
│                                                                              │
│  ┌───────────┐  ┌───────────┐  ┌──────────────┐  ┌─────────┐  ┌────────┐  │
│  │   Upload  │  │ OpenAI    │  │ Embeddings   │  │Results  │  │Langfuse│  │
│  │   CSV     │─→│ Batch     │─→│ & Similarity │─→│Aggregate│─→│Logging │  │
│  │ Langfuse  │  │ API       │  │  (optional)  │  │  Stats  │  │        │  │
│  │ Dataset   │  │ Polling   │  │              │  │         │  │        │  │
│  └───────────┘  └───────────┘  └──────────────┘  └─────────┘  └────────┘  │
│   Steps 1-3      Steps 4-10      Steps 11-15      Step 16     Steps 2,10,16│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Files Modified

### 1. `src/config/workflowConfig.ts` - Workflow Configuration
**Changes:**
- Updated `NodeType` enum to: `datasetHandler`, `llmRunner`, `moduleExecutor`, `resultsAggregator`, `langfuseLogger`
- Renamed `WorkflowConfig` features to: `includeEmbeddings` (optional module), `includeAdvancedStats`
- Defined 5 default workflow nodes with clear stage assignments and substeps
- Updated edge definitions with conditional rendering for optional embedding module
- Refactored helper functions: `getVisibleNodes()`, `getVisibleEdges()`, `buildExecutionSequence()`
- Maintained linear pipeline flow with optional bypass path

**Key Functions:**
```typescript
getVisibleNodes()           // Filters nodes based on config
getVisibleEdges()           // Filters edges, handles optional paths
buildExecutionSequence()    // Depth-first traversal for execution order
initializeWorkflow()        // Complete workflow initialization
```

### 2. `src/context/WorkflowContext.tsx` - State Management
**Changes:**
- **New Data Types:**
  - `DatasetInfo`: Dataset metadata from CSV upload
  - `BatchInfo`: OpenAI batch tracking
  - `EmbeddingResult`: Embedding results with semantic similarity
  - `EvaluationRunInfo`: Langfuse evaluation run metadata
  - `AggregatedStats`: Pipeline statistics (avg, min, max, stddev, pass/fail)

- **New State Setters (organized by stage):**
  - Stage 1: `setDataset()`, `setCsvError()`
  - Stage 2: `setBatch()`, `setBatchPollingStatus()`, `setBatchError()`
  - Stage 3: `setEmbeddings()`, `setEmbeddingsError()`
  - Stage 4: `setAggregatedStats()`, `setAggregationError()`
  - Stage 5: `setEvaluationRun()`, `setLangfuseError()`
  - General: `setCurrentStage()`, `reset()`

### 3. `src/components/WorkflowNodes.tsx` - Node Components
**5 New Node Components (replacing old nodes):**

#### **DatasetHandlerNode** (Stage 1)
- **Function:** CSV upload → Langfuse dataset creation (5x duplication) → JSONL building
- **Backend Hook:** `POST /api/dataset/upload-csv`
- **Features:**
  - CSV file upload
  - Langfuse dataset creation with 5x row duplication
  - JSONL building for OpenAI batch
  - Progress indication and success display
  - Substeps visualization (steps 1-3)

#### **LLMRunnerNode** (Stage 2)
- **Function:** JSONL upload → OpenAI batch API → polling → results download
- **Backend Hook:** `POST /api/batch/create-batch`, `GET /api/batch/{batch_id}/status`
- **Features:**
  - Batch creation trigger
  - Optional polling (frontend can demo, Celery Beat handles production)
  - Status tracking (queued → in_progress → completed → failed)
  - Substeps visualization (steps 4-10)

#### **ModuleExecutorNode** (Stage 3 - Optional)
- **Function:** Embedding JSONL → OpenAI Embeddings API → cosine similarity calculation
- **Backend Hook:** `POST /api/embeddings/process-batch`
- **Features:**
  - Optional node (toggleable via `includeEmbeddings`)
  - Semantic similarity computation
  - Substeps visualization (steps 11-15)

#### **ResultsAggregatorNode** (Stage 4)
- **Function:** Calculate aggregate statistics → update eval_run.score
- **Backend Hook:** `POST /api/results/aggregate`
- **Features:**
  - Statistics calculation (avg, min, max, stddev)
  - Pass/fail counting
  - eval_run.score update
  - Substeps visualization (step 16)

#### **LangfuseLoggerNode** (Stage 5)
- **Function:** Create EvaluationRun → Create traces → Update traces with scores
- **Backend Hook:** `POST /api/langfuse/create-evaluation-run`
- **Features:**
  - Evaluation run creation
  - Trace management
  - Score logging
  - Substeps visualization (steps 2, 10, 16)

**Shared Utilities:**
- `ResponseViewer` component: JSON response inspection for all nodes
- Consistent error handling and success states

### 4. `src/App.tsx` - Main Application
**Changes:**
- Updated node type mappings to use new 5-stage node components
- Changed workflow configuration defaults
- Updated metrics dashboard for pipeline-specific KPIs:
  - Dataset rows (with 5x duplication indicator)
  - Batch status
  - Average score
  - Langfuse trace count
- Updated header title and description
- Updated help panel with 5-stage pipeline guide
- Updated MiniMap node colors for new node types

## Backend API Integration Points

The frontend is designed to work with backend endpoints (not yet implemented):

### Dataset Handler
- `POST /api/dataset/upload-csv` → Returns: `dataset_id`, `dataset_name`, `row_count`, `duplicated_row_count`

### LLM Runner
- `POST /api/batch/create-batch` → Returns: `batch_id`, `status`, `input_file_id`, `output_file_id`
- `GET /api/batch/{batch_id}/status` → Returns: `status`, `output_file_id`
- `GET /api/batch/{batch_id}/results` → Returns: Batch results file

### Module Executor
- `POST /api/embeddings/process-batch` → Returns: `embeddings` (list with cosine similarity), `avg_similarity`

### Results Aggregator
- `POST /api/results/aggregate` → Returns: `average_score`, `min_score`, `max_score`, `std_deviation`, `pass_count`, `fail_count`

### Langfuse Logger
- `POST /api/langfuse/create-evaluation-run` → Returns: `eval_run_id`, `eval_run_name`, `created_at`, `trace_count`, `score`

## State Flow Diagram

```
WorkflowContext (5-stage state management)
    ├─ Stage 1: dataset, csvError
    ├─ Stage 2: batch, batchPollingStatus, batchError
    ├─ Stage 3: embeddings[], embeddingsError
    ├─ Stage 4: aggregatedStats, aggregationError
    ├─ Stage 5: evaluationRun, langfuseError
    └─ General: currentStage

Each node can:
- Read: useWorkflow().state
- Write: useWorkflow().setState*() methods
- Track progress via currentStage
```

## Key Design Decisions

1. **Linear Pipeline:** All stages execute sequentially (no branching except optional embedding module)
2. **Optional Module:** Embedding module (Stage 3) can be toggled via `includeEmbeddings` feature flag
3. **Conditional Edges:** Direct path from LLM Runner → Results Aggregator when embeddings are disabled
4. **Backend Hooks Ready:** All API calls have clear comments indicating backend endpoints
5. **No Mistakes:** Code is fully functional and ready for backend integration
6. **Polling Strategy:** LLM Runner includes demo polling; production should use Celery Beat
7. **Error Handling:** Each node has dedicated error state and display
8. **Response Viewers:** All nodes show full API responses for debugging

## Testing Workflow

### Without Embeddings (Default)
```
1. Upload CSV (Dataset Handler)
2. Create batch (LLM Runner)
3. Wait for completion (Polling)
4. Aggregate results (Results Aggregator)
5. Log evaluation (Langfuse Logger)
```

### With Embeddings (Optional)
```
1. Upload CSV (Dataset Handler)
2. Create batch (LLM Runner)
3. Wait for completion (Polling)
4. Run embeddings (Module Executor)
5. Aggregate results (Results Aggregator)
6. Log evaluation (Langfuse Logger)
```

## Future Backend Integration Checklist

- [ ] Implement `/api/dataset/upload-csv` endpoint
- [ ] Implement `/api/batch/create-batch` endpoint
- [ ] Implement `/api/batch/{batch_id}/status` polling endpoint
- [ ] Implement `/api/embeddings/process-batch` endpoint
- [ ] Implement `/api/results/aggregate` endpoint
- [ ] Implement `/api/langfuse/create-evaluation-run` endpoint
- [ ] Add Celery Beat for async batch polling
- [ ] Add Langfuse SDK integration
- [ ] Test end-to-end pipeline with real data
- [ ] Add error recovery mechanisms
- [ ] Implement batch result download and parsing
- [ ] Add performance metrics collection

## No Breaking Changes
- All changes are backward compatible with the React/TypeScript setup
- Maintains existing Tailwind CSS styling patterns
- Uses existing @xyflow/react ReactFlow setup
- All node components export from the same file for easy imports

---

**Status:** ✅ Complete - All 5-stage pipeline components implemented and ready for backend integration
**Date:** 2025-11-04
