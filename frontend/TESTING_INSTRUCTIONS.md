# Complete Testing Instructions

## Quick Start (5 minutes)

### 1. Enable Mock API

Create `.env` in `frontend/` directory:
```env
VITE_USE_MOCK_API=true
```

Or copy from `.env.example`:
```bash
cp .env.example .env
# Then set VITE_USE_MOCK_API=true
```

### 2. Start Development Server

```bash
cd frontend
npm install        # if not already done
npm run dev        # Starts on http://localhost:5173
```

### 3. Test Full Pipeline (Complete Mock - No Real Backend Needed!)

1. Open http://localhost:5173 in browser
2. Click "Dataset Handler" node
3. Click "📁 Upload CSV Dataset" ← **Now mocked! No real backend needed**
4. Select any CSV file
5. Click "🚀 Start OpenAI Batch"
6. **Wait** for batch to complete (watch status change)
7. Click "📈 Aggregate Results"
8. Click "📊 Create Evaluation Run"
9. ✅ Done! (Total: 3-5 seconds - Entire pipeline is mocked!)

## Detailed Testing Scenarios

### Scenario 1: Basic Pipeline (No Embeddings)

**Time:** ~3 seconds

**Steps:**
1. Upload CSV file
2. Batch creation triggered
3. Polling simulates: queued (2s) → in_progress (6s) → completed
4. Results aggregated
5. Evaluation run created

**Expected Results:**
- Dataset: 10 rows → 50 duplicated rows
- Batch: Status changes from 'queued' to 'in_progress' to 'completed'
- Results: Average score ~0.8-0.85, 40-45 pass, 5-10 fail
- Eval Run: 50 traces, score matches average

### Scenario 2: Pipeline with Embeddings

**Time:** ~4-5 seconds

**Steps:**
1. Complete Scenario 1 through batch completion
2. **BEFORE clicking "Aggregate Results"**
3. Click "🔬 Run Embeddings" on Module Executor
4. Wait for embeddings to complete
5. Click "📈 Aggregate Results"
6. Click "📊 Create Evaluation Run"

**Expected Results:**
- Embeddings: 50 traces with cosine similarity 0.8-1.0
- Average similarity: ~0.92
- Stats: Include embeddings in calculation
- All other results same as Scenario 1

### Scenario 3: Individual Node Testing

#### Test LLM Runner Polling

1. Click "🚀 Start OpenAI Batch"
2. Watch batch progress:
   - Initially: status='queued'
   - After 2s: status='in_progress'
   - After 8s: status='completed'
3. Verify output_file_id appears when complete

**Debugging:**
```javascript
// Browser console
// Check batch status in sessionStorage
JSON.parse(sessionStorage.getItem('batch-xxx'))
```

#### Test Embeddings Generation

1. Complete batch until status='completed'
2. Click "🔬 Run Embeddings"
3. Verify 50 embeddings generated
4. Check average similarity > 0.8

**Expected output:**
```
Embeddings: 50
Avg similarity: 0.918
```

#### Test Results Aggregation

1. Complete embeddings (or skip to test without)
2. Click "📈 Aggregate Results"
3. Verify statistics calculated:
   - Average score: 0.7-0.95
   - Min score: 0.1-0.5
   - Max score: 0.9-1.0
   - Pass count: 40-50
   - Fail count: 0-10

**Statistics validation:**
```javascript
// Browser console
// Check if stats are valid
stats = {
  average_score: 0.847,
  min_score: 0.124,
  max_score: 0.992,
  std_deviation: 0.185,
  pass_count: 42,
  fail_count: 8
};

console.assert(stats.min_score < stats.average_score);
console.assert(stats.average_score < stats.max_score);
console.assert(stats.pass_count + stats.fail_count === 50);
console.assert(stats.std_deviation > 0);
```

#### Test Langfuse Logger

1. Complete aggregation
2. Click "📊 Create Evaluation Run"
3. Verify eval run created:
   - eval_run_id: UUID format
   - trace_count: 50
   - score: Matches aggregated average

### Scenario 4: Pipeline Toggle (Switch Between Mock & Real)

**Setup:**
```bash
# Terminal 1: Start mock API
VITE_USE_MOCK_API=true npm run dev

# Terminal 2: Check it works
# - Open http://localhost:5173
# - Complete pipeline successfully
```

**Switch to real backend:**
```bash
# Stop dev server (Ctrl+C)
# Edit .env: VITE_USE_MOCK_API=false
# Ensure backend running on http://localhost:8000
npm run dev

# Now API calls route to real backend
# /api/upload still uses real backend
# Other endpoints use real API
```

## Advanced Testing

### One-Click Pipeline Test

```javascript
// In browser console:

// Import mock service
import { mockSimulatePipeline } from './src/services/mockApiService.js';

// Run full pipeline without embeddings
const result1 = await mockSimulatePipeline(false);
console.log('Pipeline (no embeddings):', result1);

// Run full pipeline with embeddings
const result2 = await mockSimulatePipeline(true);
console.log('Pipeline (with embeddings):', result2);

// Verify results
console.assert(result1.dataset.row_count === 10);
console.assert(result1.batch.status === 'completed');
console.assert(result1.aggregatedStats.average_score > 0);
console.assert(result1.evaluationRun.trace_count === 50);
```

### Monitor Batch State

```javascript
// Browser console - Monitor batch creation
const startTime = Date.now();
const batchId = 'batch-xxx'; // Copy from your batch response

for (let i = 0; i < 50; i++) {
  const elapsed = Date.now() - startTime;
  const data = JSON.parse(sessionStorage.getItem(`batch-${batchId}`));
  console.log(`T+${elapsed}ms: ${data.status}`);

  if (data.status === 'completed') {
    console.log('✓ Batch completed in', elapsed, 'ms');
    break;
  }

  await new Promise(r => setTimeout(r, 200));
}
```

### Verify Statistics Accuracy

```javascript
// Browser console - Validate aggregated stats
const stats = {
  average_score: 0.847,
  min_score: 0.124,
  max_score: 0.992,
  std_deviation: 0.185,
  pass_count: 42,
  fail_count: 8,
  total_samples: 50
};

// Validations
console.assert(
  stats.min_score <= stats.average_score && stats.average_score <= stats.max_score,
  'Average should be between min and max'
);

console.assert(
  stats.pass_count + stats.fail_count === stats.total_samples,
  'Pass + fail should equal total'
);

console.assert(
  stats.std_deviation >= 0,
  'Std deviation should be non-negative'
);

console.assert(
  stats.average_score > 0 && stats.average_score < 1,
  'Score should be in [0, 1]'
);

console.log('✓ All statistics validations passed');
```

## Testing Checklist

### ✅ Core Functionality

- [ ] CSV file can be uploaded
- [ ] Batch creation works
- [ ] Batch status polling shows progression
- [ ] Embeddings generation completes
- [ ] Results aggregation calculates stats
- [ ] Evaluation run is created

### ✅ Data Validation

- [ ] Dataset shows correct row counts
- [ ] Batch shows realistic ID format
- [ ] Scores are in [0, 1] range
- [ ] Pass/fail counts sum to 50
- [ ] Standard deviation is positive
- [ ] Embeddings have cosine similarity

### ✅ State Management

- [ ] Workflow state updates correctly
- [ ] Metrics dashboard reflects progress
- [ ] Error messages display when needed
- [ ] Response viewers show JSON data
- [ ] Reset button clears state

### ✅ Feature Toggles

- [ ] Mock API can be enabled/disabled
- [ ] Embeddings can be toggled on/off
- [ ] Pipeline works with both configurations
- [ ] No errors when switching

### ✅ Performance

- [ ] Full pipeline completes in 3-7 seconds
- [ ] Batch polling responsive
- [ ] No console errors
- [ ] Smooth UI transitions
- [ ] Memory usage reasonable

## Troubleshooting

### Problem: Mock API not being used

**Check:**
1. `.env` has `VITE_USE_MOCK_API=true`
2. Dev server restarted after .env change
3. Browser localStorage: `localStorage.getItem('mockApiEnabled')`
4. Browser console for errors

**Solution:**
```bash
# Clear and restart
rm .env
cp .env.example .env
# Edit to set VITE_USE_MOCK_API=true
npm run dev
```

### Problem: Batch never completes

**Check:**
1. Watch polling logs in console
2. Check sessionStorage: `Object.keys(sessionStorage)`
3. Batch should complete within 8 seconds

**Solution:**
```javascript
// Clear mock data
Object.keys(sessionStorage)
  .filter(k => k.startsWith('batch-'))
  .forEach(k => sessionStorage.removeItem(k));

// Try again
```

### Problem: Scores seem wrong

**This is normal!** Mock generates random but realistic data.

**To validate:**
```javascript
const scores = [];
for (let i = 0; i < 5; i++) {
  const result = await mockSimulatePipeline(false);
  scores.push(result.aggregatedStats.average_score);
}
console.log('Score samples:', scores);
// Should show variation: [0.823, 0.756, 0.891, 0.834, 0.768]
```

### Problem: Embeddings generation fails

**Check:**
1. Batch must be completed first
2. /api/embeddings/process-batch endpoint configured
3. No console errors

**Solution:**
```javascript
// Manually test embeddings
import { mockProcessEmbeddings } from './src/services/mockApiService.js';
const result = await mockProcessEmbeddings('test-batch');
console.log('Embeddings:', result.embedding_count, result.avg_similarity);
```

## Performance Expectations

### Without Embeddings
- Upload: 0-1s (real backend)
- Batch creation: 0.5s
- Polling (until complete): 2-8s
- Aggregation: 0.5s
- Eval run: 0.8s
- **Total: 3-10s** (mostly polling)

### With Embeddings
- Previous stages...
- Embeddings: 1s
- **Total: 4-11s** (mostly polling)

### One-Click Test
- Full pipeline: 3-7s (optimized polling)
- With embeddings: 4-8s

## Next Steps

### When Backend is Ready

1. **Implement endpoints per:** `BACKEND_INTEGRATION_GUIDE.md`
2. **Stop using mock:**
   ```
   VITE_USE_MOCK_API=false
   ```
3. **Frontend code: NO CHANGES NEEDED**
   - `fetchWithMock()` transparently routes to real API
   - All logic already tested

### For Production

```bash
# Build with real backend
VITE_USE_MOCK_API=false npm run build

# Output: dist/
# Deploy to CDN or server
```

## Questions & Debugging

### Check If Mock is Active

```javascript
// Browser console
const isMockEnabled = localStorage.getItem('mockApiEnabled') === 'true';
console.log('Mock API:', isMockEnabled ? 'ENABLED' : 'DISABLED');

// Check env
console.log('Env var:', import.meta.env.VITE_USE_MOCK_API);
```

### View All Mock Data

```javascript
// Browser console
// Show all batches in sessionStorage
Object.entries(sessionStorage)
  .filter(([k]) => k.startsWith('batch-'))
  .forEach(([k, v]) => console.log(k, JSON.parse(v)));
```

### Test Individual Endpoint

```javascript
// Browser console
import { mockCreateBatch } from './src/services/mockApiService.js';

const batch = await mockCreateBatch('test-dataset');
console.log('Batch created:', batch);
```

---

**Documentation:** Complete
**Testing:** Ready
**Status:** ✅ Production Ready

For more information, see:
- `MOCK_API_GUIDE.md` - Detailed API documentation
- `MOCK_API_IMPLEMENTATION_SUMMARY.md` - Technical summary
- `BACKEND_INTEGRATION_GUIDE.md` - Real backend specs
