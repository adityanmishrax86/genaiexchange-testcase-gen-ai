# Mock API Testing Guide

## Overview

The mock API allows you to test the entire 5-stage LLM Evaluation Pipeline **without needing a real backend**. All API endpoints are intercepted and mocked with realistic responses, including file uploads.

## Quick Start

### 1. Enable Mock API

Add to your `.env` file:
```
VITE_USE_MOCK_API=true
```

Or toggle at runtime via the mock API hook.

### 2. Test the Pipeline

1. Open the application in your browser
2. Upload a CSV file (Dataset Handler node)
3. Click "Start OpenAI Batch" (LLM Runner node)
4. Wait for batch to complete (simulated polling)
5. Optionally run embeddings (Module Executor node)
6. Aggregate results (Results Aggregator node)
7. Create evaluation run (Langfuse Logger node)

## How It Works

### Fetch Interception

The `useMockApi` hook provides a `fetchWithMock()` function that:
1. Checks if mock API is enabled in localStorage
2. If enabled and endpoint is not `/api/upload`, routes to mock implementation
3. Otherwise, calls real backend via fetch
4. Always skips mock for `/api/upload` (uses real backend)

### Session Storage

Mock API uses browser's `sessionStorage` to simulate stateful operations:
- Batch status is stored with creation timestamp
- Polling simulates 2s queued → 6s in_progress → completion
- Data is automatically cleaned on page reload

### Realistic Delays

All endpoints include network-realistic delays:
- File upload: 500ms
- Batch creation: 500ms
- Batch polling: 200ms per poll
- Embeddings processing: 1000ms
- Results aggregation: 500ms
- Evaluation run creation: 800ms

## API Endpoints & Responses

### POST /api/upload

**Mock Behavior:**
- Accepts FormData with file field
- Extracts filename and estimates row count from file size
- Generates dataset_id and calculates duplicated_row_count (5x original rows)
- Simulates 500ms network delay

**Request:**
```javascript
const formData = new FormData();
formData.append('file', csvFile);

const response = await fetch('/api/upload', {
  method: 'POST',
  body: formData
});
const data = await response.json();
```

**Response:**
```json
{
  "dataset_id": "ds-1730000000000-abc123",
  "dataset_name": "my-requirements",
  "row_count": 10,
  "duplicated_row_count": 50,
  "jsonl_path": "/tmp/dataset-ds-1730000000000-abc123.jsonl"
}
```

### POST /api/batch/create-batch

**Mock Behavior:**
- Stores batch in sessionStorage with 'queued' status
- Sets processing start time
- Returns batch_id, input_file_id, and status

**Response:**
```json
{
  "batch_id": "batch-1730000000000-abc123",
  "status": "queued",
  "input_file_id": "file-abc123def456...",
  "output_file_id": null,
  "created_at": "2025-11-04T12:00:00.000Z",
  "message": "Batch created successfully"
}
```

### GET /api/batch/{batch_id}/status

**Mock Behavior:**
- Retrieves stored batch from sessionStorage
- Simulates progression: queued (0-2s) → in_progress (2-8s) → completed (8s+)
- Updates stored batch data on each poll
- Returns null output_file_id until batch is complete

**Response:**
```json
{
  "batch_id": "batch-1730000000000-abc123",
  "status": "completed",
  "input_file_id": "file-abc123def456...",
  "output_file_id": "file-output-xyz789...",
  "completed_at": "2025-11-04T12:00:10.000Z",
  "error_message": null
}
```

### POST /api/embeddings/process-batch

**Mock Behavior:**
- Generates 50 random embedding vectors (1536 dimensions each)
- Calculates cosine similarity between each vector and a reference
- Returns embeddings with similarity scores normalized to [0, 1]

**Response:**
```json
{
  "embeddings": [
    {
      "trace_id": "trace-batch-1730000000000-abc123-0",
      "embeddings": [-0.001, 0.042, -0.015, ...],
      "cosine_similarity": 0.923
    },
    // ... 50 total embeddings
  ],
  "avg_similarity": 0.918,
  "embedding_count": 50,
  "completed_at": "2025-11-04T12:00:11.000Z"
}
```

### POST /api/results/aggregate

**Mock Behavior:**
- Generates 50 realistic score samples
- 80% of scores biased high (0.7-0.95 range)
- 20% of scores low (0.0-0.7 range)
- Calculates statistics: avg, min, max, stddev
- Pass/fail threshold: 0.6

**Response:**
```json
{
  "average_score": 0.847,
  "min_score": 0.124,
  "max_score": 0.992,
  "std_deviation": 0.185,
  "pass_count": 42,
  "fail_count": 8,
  "total_samples": 50,
  "eval_run_score_updated": true
}
```

### POST /api/langfuse/create-evaluation-run

**Mock Behavior:**
- Generates evaluation run ID
- Creates 50 mock traces
- Associates traces with provided dataset and batch
- Returns eval run metadata with trace count and aggregated score

**Response:**
```json
{
  "eval_run_id": "eval-1730000000000-def789",
  "eval_run_name": "Evaluation Run 11/4/2025, 12:00:10 PM",
  "created_at": "2025-11-04T12:00:11.000Z",
  "trace_count": 50,
  "score": 0.847,
  "message": "Evaluation run created with 50 traces. Score: 0.85"
}
```

## Testing Scenarios

### Scenario 1: Full Pipeline (Without Embeddings)

1. **Upload CSV** (real backend)
   - Input: CSV file with QnA pairs
   - Expected: Dataset created with row count and 5x duplication count

2. **Create Batch** (mock backend)
   - Expected: batch_id returned
   - Status initially 'queued'

3. **Poll Batch** (mock backend)
   - Expected: Status progresses from 'queued' → 'in_progress' → 'completed'
   - Polling takes ~10 seconds (simulated 2s → 6s → completion)

4. **Aggregate Results** (mock backend)
   - Expected: Statistics calculated with realistic score distribution
   - Pass/fail counts reflect threshold

5. **Create Evaluation Run** (mock backend)
   - Expected: eval_run_id generated
   - Trace count = 50
   - Score matches aggregation average

### Scenario 2: Full Pipeline (With Embeddings)

Same as Scenario 1, but after step 3:

3b. **Process Embeddings** (mock backend)
   - Expected: 50 embeddings with cosine similarity scores
   - Similarity scores should be > 0.8 on average

### Scenario 3: Single Node Testing

You can test individual nodes by triggering them manually:

**Test LLM Runner Polling:**
1. Create batch manually
2. Use browser console to monitor polling:
   ```javascript
   // Open DevTools, paste in console:
   const mockApi = import.meta.importMetaHot;
   const batchId = 'batch-xxx'; // Copy from response
   for (let i = 0; i < 10; i++) {
     setTimeout(async () => {
       const status = await mockGetBatchStatus(batchId);
       console.log(`Poll ${i}:`, status.status);
     }, i * 1000);
   }
   ```

**Test Embeddings Calculation:**
1. Get any batch_id
2. Call embeddings endpoint directly:
   ```javascript
   const response = await fetch('/api/embeddings/process-batch', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({ batch_id: 'test-batch' })
   });
   const data = await response.json();
   console.log('Embeddings:', data.embedding_count, 'Avg similarity:', data.avg_similarity);
   ```

## Debugging & Monitoring

### Console Logging

Mock API includes detailed console logging:
```javascript
// When enabled, you'll see:
// "Starting mock pipeline simulation..."
// "✓ Dataset created: ds-xxx"
// "✓ Batch created: batch-xxx"
// "✓ Batch completed after 50 polls"
// "✓ Results aggregated: 0.847"
// "✓ Evaluation run created: eval-xxx"
```

### Session Storage Inspection

To inspect stored batch data:
```javascript
// In browser console:
const batchId = 'batch-xxx'; // Your batch ID
const data = JSON.parse(sessionStorage.getItem(`batch-${batchId}`));
console.log('Batch data:', data);
// Shows: { status, startTime, outputFileId, completedAt }
```

### Clear Mock Data

To clear all mock data:
```javascript
// In browser console:
Object.keys(sessionStorage).forEach(key => {
  if (key.startsWith('batch-')) sessionStorage.removeItem(key);
});
console.log('Mock data cleared');
```

## One-Click Pipeline Test

The mock API provides a helper function for automated testing:

```javascript
// In browser console:
import { mockSimulatePipeline } from './services/mockApiService';

// Run without embeddings
const result = await mockSimulatePipeline(false);
console.log('Pipeline completed:', result);

// Run with embeddings
const resultWithEmbeddings = await mockSimulatePipeline(true);
console.log('Pipeline with embeddings completed:', resultWithEmbeddings);
```

This will:
1. Create dataset
2. Create batch
3. Poll until completion
4. (Optional) Process embeddings
5. Aggregate results
6. Create evaluation run
7. Return complete result object

## Realistic Data Generation

### Score Distribution

Scores are generated with realistic distribution:
- 80% of samples: 0.7-0.95 (high quality)
- 20% of samples: 0.0-0.7 (lower quality)
- Mean: ~0.8-0.85
- Std Dev: ~0.15-0.2

### Embeddings Vectors

- 1536 dimensions (matching OpenAI ada embeddings)
- Normalized to unit vectors
- Cosine similarity: 0.8-1.0 range typically
- Realistic distribution across 50 traces

### Timestamps

- All timestamps in ISO 8601 format
- Relative times based on elapsed duration
- Matches real API behavior

## Switching Between Mock & Real API

### Option 1: Environment Variable

1. Create `.env` file:
   ```
   VITE_USE_MOCK_API=true    # Use mock
   # or
   VITE_USE_MOCK_API=false   # Use real backend
   ```

2. Restart dev server:
   ```bash
   npm run dev
   ```

### Option 2: Runtime Toggle

```javascript
// In browser console:
localStorage.setItem('mockApiEnabled', 'true');   // Enable mock
localStorage.setItem('mockApiEnabled', 'false');  // Disable mock
location.reload(); // Refresh to apply
```

### Option 3: Custom Hook

In any component:
```typescript
import { useMockApi } from '@/hooks/useMockApi';

function MyComponent() {
  const { isMockEnabled, toggleMock } = useMockApi();

  return (
    <button onClick={toggleMock}>
      {isMockEnabled ? 'Use Real API' : 'Use Mock API'}
    </button>
  );
}
```

## Performance Characteristics

Mock API endpoint timings (with delays):
```
POST /api/batch/create-batch:      ~500ms
GET  /api/batch/{id}/status:       ~200ms per poll (×5-50 times)
POST /api/embeddings/process-batch: ~1000ms
POST /api/results/aggregate:        ~500ms
POST /api/langfuse/...:            ~800ms

Full pipeline (without embeddings):  ~3-6 seconds (including polling)
Full pipeline (with embeddings):    ~4-7 seconds (including polling)
```

## Known Limitations

1. **No persistence:** Data is cleared on page refresh (uses sessionStorage)
2. **No real OpenAI integration:** Mock embeddings are randomly generated, not from real OpenAI
3. **No Langfuse integration:** Mock eval runs don't actually log to Langfuse
4. **Always 50 samples:** Mock always generates 50 embeddings/traces
5. **Deterministic polling:** Batch always completes in ~8 seconds

## Transition to Real Backend

When backend is ready:

1. Set `VITE_USE_MOCK_API=false` in `.env`
2. Ensure backend implements all endpoints per `BACKEND_INTEGRATION_GUIDE.md`
3. Frontend code requires **no changes** - `fetchWithMock` transparently routes to real API
4. Test with real CSV files and batch data

## Troubleshooting

### Mock API not being called

1. Check `.env` has `VITE_USE_MOCK_API=true`
2. Check browser localStorage: `localStorage.getItem('mockApiEnabled')` should be `'true'`
3. Check browser console for errors
4. Clear browser cache and reload

### Batch never completes

1. Check browser DevTools console for polling logs
2. Check sessionStorage: `sessionStorage.getItem('batch-xxx')`
3. Mock polling timing: batch should complete in ~8 seconds
4. If stuck, clear mock data and try again

### Scores seem unrealistic

1. This is expected - mock generates realistic but random distributions
2. Run pipeline multiple times to see variation
3. Check `BACKEND_INTEGRATION_GUIDE.md` for actual backend requirements

---

**Status:** ✅ Complete - Mock API ready for testing
**Last Updated:** 2025-11-04
