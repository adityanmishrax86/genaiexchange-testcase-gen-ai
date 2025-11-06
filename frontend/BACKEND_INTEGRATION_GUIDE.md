# Backend Integration Guide - LLM Evaluation Pipeline

## Overview

This document specifies the backend API endpoints required to complete the LLM Evaluation Pipeline frontend implementation. The frontend is fully functional and ready for backend integration.

## API Endpoints Required

### 1. Dataset Handler Endpoints

#### **POST /api/upload**

**Purpose:** Upload CSV file, create Langfuse dataset with 5x duplication, build JSONL for OpenAI

**Request:**

```
Content-Type: multipart/form-data
Body:
  - file: CSV file (contains questions and answers for QnA pairs)
```

**Response:**

```json
{
  "dataset_id": "string (UUID or ID)",
  "dataset_name": "string",
  "row_count": "integer (original CSV rows)",
  "duplicated_row_count": "integer (5x * row_count)",
  "jsonl_path": "string (internal path for next step)"
}
```

**Frontend Hook:** `DatasetHandlerNode` (lines 45-172 in WorkflowNodes.tsx)

---

### 2. LLM Runner Endpoints

#### **POST /api/batch/create-batch**

**Purpose:** Upload JSONL to OpenAI Files API and create batch job

**Request:**

```json
{
  "dataset_id": "string (from dataset handler)",
  "jsonl_data": "optional - if sending JSONL directly"
}
```

**Response:**

```json
{
  "batch_id": "string (OpenAI batch_id)",
  "status": "queued | in_progress | completed | failed",
  "input_file_id": "string (OpenAI file_id)",
  "output_file_id": "string (null initially, set after completion)",
  "created_at": "ISO 8601 timestamp",
  "message": "Batch created successfully"
}
```

**Frontend Hook:** `LLMRunnerNode` (lines 185-364 in WorkflowNodes.tsx)

---

#### **GET /api/batch/{batch_id}/status**

**Purpose:** Poll batch status (Celery Beat in production, optional frontend polling for demo)

**Request:**

```
GET /api/batch/batch-12345/status
```

**Response:**

```json
{
  "batch_id": "string",
  "status": "queued | in_progress | completed | failed",
  "input_file_id": "string",
  "output_file_id": "string (populated when complete)",
  "completed_at": "ISO 8601 timestamp (null if not complete)",
  "error_message": "string (if failed)"
}
```

**Frontend Hook:** `LLMRunnerNode.pollBatchStatus()` (lines 249-285 in WorkflowNodes.tsx)

---

#### **GET /api/batch/{batch_id}/results**

**Purpose:** Download completed batch results file

**Request:**

```
GET /api/batch/batch-12345/results
```

**Response:**

```
JSONL file with LLM responses
```

**Note:** Frontend doesn't directly call this; backend handles internally after batch completion

---

### 3. Embeddings/Module Executor Endpoints

#### **POST /api/embeddings/process-batch**

**Purpose:** Build embedding JSONL, upload to OpenAI Embeddings API, calculate cosine similarity (optional)

**Request:**

```json
{
  "batch_id": "string (from LLM runner)",
  "include_similarity": "boolean (default: true)"
}
```

**Response:**

```json
{
  "embeddings": [
    {
      "trace_id": "string",
      "embeddings": [0.1, 0.2, 0.3, ...],
      "cosine_similarity": 0.95
    }
    // ... more embeddings
  ],
  "avg_similarity": 0.92,
  "embedding_count": 50,
  "completed_at": "ISO 8601 timestamp"
}
```

**Frontend Hook:** `ModuleExecutorNode` (lines 381-494 in WorkflowNodes.tsx)

---

### 4. Results Aggregator Endpoints

#### **POST /api/results/aggregate**

**Purpose:** Calculate aggregate statistics (avg, min, max, stddev) and update eval_run.score

**Request:**

```json
{
  "batch_id": "string",
  "include_embeddings": "boolean (was embeddings module run?)",
  "eval_run_id": "string (from Langfuse logger, optional)"
}
```

**Response:**

```json
{
  "average_score": 0.85,
  "min_score": 0.5,
  "max_score": 0.99,
  "std_deviation": 0.15,
  "pass_count": 45,
  "fail_count": 5,
  "total_samples": 50,
  "eval_run_score_updated": true
}
```

**Frontend Hook:** `ResultsAggregatorNode` (lines 508-638 in WorkflowNodes.tsx)

---

### 5. Langfuse Logger Endpoints

#### **POST /api/langfuse/create-evaluation-run**

**Purpose:** Create EvaluationRun, create traces for each QnA pair, update traces with final scores

**Request:**

```json
{
  "dataset_id": "string",
  "batch_id": "string (optional)",
  "aggregated_stats": {
    "average_score": 0.85,
    "min_score": 0.5,
    "max_score": 0.99,
    "std_deviation": 0.15,
    "pass_count": 45,
    "fail_count": 5
  }
}
```

**Response:**

```json
{
  "eval_run_id": "string (Langfuse run ID)",
  "eval_run_name": "string",
  "created_at": "ISO 8601 timestamp",
  "trace_count": 50,
  "score": 0.85,
  "message": "Evaluation run created and traces logged"
}
```

**Frontend Hook:** `LangfuseLoggerNode` (lines 650-775 in WorkflowNodes.tsx)

---

## Implementation Steps

### Step 1: Environment Setup

- Install required libraries:
  ```bash
  pip install langfuse openai requests
  ```
- Set up Langfuse API keys
- Set up OpenAI API keys
- Configure Celery Beat for async batch polling (optional but recommended)

### Step 2: Implement Dataset Handler

1. Create `POST /api/dataset/upload-csv` endpoint
2. Implement CSV parsing logic
3. Create Langfuse dataset with 5x row duplication
4. Build JSONL format for OpenAI batch: `{"custom_id": "...", "params": {...}}`
5. Return dataset_id and counts

### Step 3: Implement LLM Runner

1. Create `POST /api/batch/create-batch` endpoint
2. Upload JSONL to OpenAI Files API
3. Create OpenAI Batch job with uploaded file
4. Return batch_id and status
5. Create `GET /api/batch/{batch_id}/status` endpoint for polling
6. (Optional) Set up Celery Beat task to poll batch status every 30 seconds

### Step 4: Implement Module Executor (Optional)

1. Create `POST /api/embeddings/process-batch` endpoint
2. Build embedding JSONL from batch results
3. Call OpenAI Embeddings API
4. Calculate cosine similarity between embeddings
5. Return embeddings with similarity scores

### Step 5: Implement Results Aggregator

1. Create `POST /api/results/aggregate` endpoint
2. Parse batch results and calculate statistics
3. Update eval_run.score in Langfuse
4. Return aggregated stats

### Step 6: Implement Langfuse Logger

1. Create `POST /api/langfuse/create-evaluation-run` endpoint
2. Create EvaluationRun in Langfuse
3. Create traces for each QnA pair (Step 2)
4. Update traces with scores from aggregation (Step 16)
5. Return eval_run_id and trace_count

---

## Error Handling

Each endpoint should return appropriate HTTP status codes:

- `200 OK` - Success
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `409 Conflict` - State conflict (e.g., dataset already exists)
- `500 Internal Server Error` - Server error
- `503 Service Unavailable` - External API (OpenAI) unavailable

All errors should include a `message` field with human-readable error description.

---

## Testing Checklist

- [ ] Test CSV upload with various file formats (UTF-8, with special chars, etc.)
- [ ] Verify Langfuse dataset creation with 5x duplication
- [ ] Test OpenAI batch API integration
- [ ] Verify batch polling works correctly
- [ ] Test embeddings API integration (optional)
- [ ] Verify statistics calculation accuracy
- [ ] Test Langfuse trace creation and updates
- [ ] End-to-end pipeline test with sample data
- [ ] Error handling for each endpoint
- [ ] Performance testing with large datasets

---

## Frontend-Backend Contract

The frontend expects:

1. **Consistent JSON response format** with all required fields
2. **ISO 8601 timestamps** for all date/time fields
3. **Snake_case field names** in JSON responses
4. **Clear error messages** for debugging
5. **Proper HTTP status codes** for error conditions

The backend can expect:

1. **Proper multipart/form-data for file uploads** (dataset handler)
2. **JSON payloads with dataset_id references** for subsequent steps
3. **No session/auth required** (current implementation assumes no auth)
4. **Polling from frontend** for batch status (optional in production)

---

## Example Full Pipeline Request/Response Flow

```
1. Frontend → POST /api/dataset/upload-csv
   ← Response: {dataset_id: "ds-123", duplicated_row_count: 50}

2. Frontend → POST /api/batch/create-batch
   ← Response: {batch_id: "batch-456", status: "queued"}

3. Frontend → GET /api/batch/batch-456/status (polls every 5 seconds)
   ← Response: {status: "in_progress"} (multiple times)
   ← Eventually: {status: "completed", output_file_id: "file-789"}

4. Frontend → POST /api/embeddings/process-batch (if enabled)
   ← Response: {embeddings: [...], avg_similarity: 0.92}

5. Frontend → POST /api/results/aggregate
   ← Response: {average_score: 0.85, ...}

6. Frontend → POST /api/langfuse/create-evaluation-run
   ← Response: {eval_run_id: "run-012", trace_count: 50, score: 0.85}
```

---

## Code Comments in Frontend

All node components include detailed comments indicating:

- What step numbers are implemented
- Which backend endpoints are called
- What parameters are sent
- What response is expected

Search for "Backend hook" in `src/components/WorkflowNodes.tsx` for exact hook points.

---

**Status:** Ready for implementation
**Date:** 2025-11-04
