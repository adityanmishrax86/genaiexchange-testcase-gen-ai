/**
 * mockApiService.ts - Mock API Service for Testing
 *
 * Provides realistic mock responses for all backend endpoints.
 * This allows testing the entire pipeline without a real backend.
 *
 * Mocked endpoints:
 * - POST /api/upload - File upload and dataset creation
 * - POST /api/batch/create-batch - Batch creation
 * - GET /api/batch/{batch_id}/status - Batch status polling
 * - POST /api/embeddings/process-batch - Embeddings processing
 * - POST /api/results/aggregate - Results aggregation
 * - POST /api/langfuse/create-evaluation-run - Evaluation run creation
 *
 * To use: Set VITE_USE_MOCK_API=true in .env
 */

// ============ TYPES ============

export interface MockDatasetResponse {
  dataset_id: string;
  dataset_name: string;
  row_count: number;
  duplicated_row_count: number;
  jsonl_path: string;
}

export interface MockBatchResponse {
  batch_id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  input_file_id: string;
  output_file_id: string | null;
  created_at: string;
  message: string;
}

export interface MockBatchStatusResponse {
  batch_id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  input_file_id: string;
  output_file_id: string | null;
  completed_at: string | null;
  error_message?: string;
}

export interface MockEmbeddingItem {
  trace_id: string;
  embeddings: number[];
  cosine_similarity: number;
}

export interface MockEmbeddingsResponse {
  embeddings: MockEmbeddingItem[];
  avg_similarity: number;
  embedding_count: number;
  completed_at: string;
}

export interface MockAggregateResponse {
  average_score: number;
  min_score: number;
  max_score: number;
  std_deviation: number;
  pass_count: number;
  fail_count: number;
  total_samples: number;
  eval_run_score_updated: boolean;
}

export interface MockEvaluationRunResponse {
  eval_run_id: string;
  eval_run_name: string;
  created_at: string;
  trace_count: number;
  score: number;
  message: string;
}

// ============ UTILITY FUNCTIONS ============

/**
 * Generate random batch ID
 */
function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate random file ID (like OpenAI format)
 */
function generateFileId(): string {
  return `file-${Math.random().toString(36).substring(2, 22)}`;
}

/**
 * Generate random dataset ID
 */
function generateDatasetId(): string {
  return `ds-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate random evaluation run ID
 */
function generateEvalRunId(): string {
  return `eval-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Generate random embeddings vector (1536 dimensions like OpenAI ada)
 */
function generateEmbeddings(): number[] {
  const dimensions = 1536;
  const embeddings = [];
  for (let i = 0; i < dimensions; i++) {
    embeddings.push(Math.random() * 2 - 1); // Range [-1, 1]
  }
  // Normalize to unit vector
  const magnitude = Math.sqrt(embeddings.reduce((sum, val) => sum + val * val, 0));
  return embeddings.map((val) => val / magnitude);
}

/**
 * Calculate cosine similarity between two vectors
 */
function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  let dotProduct = 0;
  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
  }
  return Math.min(Math.max(dotProduct, -1), 1); // Clamp to [-1, 1]
}

/**
 * Simulate processing delay
 */
async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ MOCK API ENDPOINTS ============

/**
 * Simulate POST /api/upload
 * Handles CSV file upload and creates dataset
 */
export async function mockHandleFileUpload(file: File): Promise<MockDatasetResponse> {
  // Simulate network delay
  await delay(500);

  // Extract filename without extension
  const filename = file.name.replace(/\.[^/.]+$/, '');

  // Estimate row count from file size (rough estimation)
  // Average CSV row: ~100 bytes, so divide by 100 to get row count
  const estimatedRowCount = Math.max(10, Math.floor(file.size / 100));
  const duplicatedRowCount = estimatedRowCount * 5;

  const datasetId = generateDatasetId();

  return {
    dataset_id: datasetId,
    dataset_name: filename,
    row_count: estimatedRowCount,
    duplicated_row_count: duplicatedRowCount,
    jsonl_path: `/tmp/dataset-${datasetId}.jsonl`,
  };
}

/**
 * Simulate POST /api/batch/create-batch
 * Creates batch and starts polling simulation
 */
export async function mockCreateBatch(datasetId: string): Promise<MockBatchResponse> {
  // Simulate network delay
  await delay(500);

  const batchId = generateBatchId();
  const inputFileId = generateFileId();

  // Store batch info in session storage for polling
  sessionStorage.setItem(
    `batch-${batchId}`,
    JSON.stringify({
      status: 'queued',
      startTime: Date.now(),
      outputFileId: null,
    })
  );

  return {
    batch_id: batchId,
    status: 'queued',
    input_file_id: inputFileId,
    output_file_id: null,
    created_at: new Date().toISOString(),
    message: 'Batch created successfully',
  };
}

/**
 * Simulate GET /api/batch/{batch_id}/status
 * Returns batch status with simulation of processing
 */
export async function mockGetBatchStatus(batchId: string): Promise<MockBatchStatusResponse> {
  // Simulate network delay
  await delay(200);

  // Retrieve stored batch info
  const batchDataStr = sessionStorage.getItem(`batch-${batchId}`);
  if (!batchDataStr) {
    return {
      batch_id: batchId,
      status: 'failed',
      input_file_id: generateFileId(),
      output_file_id: null,
      completed_at: null,
      error_message: 'Batch not found',
    };
  }

  const batchData = JSON.parse(batchDataStr);
  const elapsedTime = Date.now() - batchData.startTime;

  // Simulate processing stages
  let status: 'queued' | 'in_progress' | 'completed' | 'failed' = 'queued';

  if (elapsedTime < 2000) {
    status = 'queued';
  } else if (elapsedTime < 8000) {
    status = 'in_progress';
  } else {
    status = 'completed';
    batchData.outputFileId = generateFileId();
    batchData.completedAt = new Date().toISOString();
  }

  // Update stored batch info
  batchData.status = status;
  sessionStorage.setItem(`batch-${batchId}`, JSON.stringify(batchData));

  return {
    batch_id: batchId,
    status,
    input_file_id: sessionStorage.getItem(`batch-${batchId}-input`) || generateFileId(),
    output_file_id: batchData.outputFileId || null,
    completed_at: batchData.completedAt || null,
    error_message: undefined,
  };
}

/**
 * Simulate POST /api/embeddings/process-batch
 * Generates random embeddings and calculates similarities
 */
export async function mockProcessEmbeddings(batchId: string): Promise<MockEmbeddingsResponse> {
  // Simulate network delay
  await delay(1000);

  // Generate mock embeddings for 50 traces
  const traceCount = 50;
  const embeddings: MockEmbeddingItem[] = [];
  const referenceEmbedding = generateEmbeddings();

  for (let i = 0; i < traceCount; i++) {
    const embedding = generateEmbeddings();
    const similarity = calculateCosineSimilarity(referenceEmbedding, embedding);

    embeddings.push({
      trace_id: `trace-${batchId}-${i}`,
      embeddings: embedding,
      cosine_similarity: Math.round((similarity + 1) / 2 * 1000) / 1000, // Normalize to [0, 1] and round
    });
  }

  // Calculate average similarity
  const avgSimilarity =
    Math.round(
      (embeddings.reduce((sum, e) => sum + e.cosine_similarity, 0) / embeddings.length) * 1000
    ) / 1000;

  return {
    embeddings,
    avg_similarity: avgSimilarity,
    embedding_count: embeddings.length,
    completed_at: new Date().toISOString(),
  };
}

/**
 * Simulate POST /api/results/aggregate
 * Calculates aggregate statistics
 */
export async function mockAggregateResults(
  batchId: string,
  includeEmbeddings: boolean
): Promise<MockAggregateResponse> {
  // Simulate network delay
  await delay(500);

  const sampleCount = 50;
  const scores = [];

  // Generate realistic score distribution
  for (let i = 0; i < sampleCount; i++) {
    // Bias towards higher scores (0.7-0.95) but include some lower ones
    const score = Math.random() < 0.8 ? Math.random() * 0.25 + 0.7 : Math.random() * 0.7;
    scores.push(Math.round(score * 1000) / 1000);
  }

  scores.sort((a, b) => a - b);

  // Calculate statistics
  const average = Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 1000) / 1000;
  const minScore = scores[0];
  const maxScore = scores[scores.length - 1];

  // Calculate standard deviation
  const variance =
    scores.reduce((sum, score) => sum + Math.pow(score - average, 2), 0) / scores.length;
  const stdDeviation = Math.round(Math.sqrt(variance) * 1000) / 1000;

  // Count pass/fail (threshold: 0.6)
  const passCount = scores.filter((s) => s >= 0.6).length;
  const failCount = scores.filter((s) => s < 0.6).length;

  return {
    average_score: average,
    min_score: minScore,
    max_score: maxScore,
    std_deviation: stdDeviation,
    pass_count: passCount,
    fail_count: failCount,
    total_samples: sampleCount,
    eval_run_score_updated: true,
  };
}

/**
 * Simulate POST /api/langfuse/create-evaluation-run
 * Creates evaluation run and logs traces
 */
export async function mockCreateEvaluationRun(
  datasetId: string,
  batchId: string | undefined,
  aggregatedStats: {
    average_score: number;
    pass_count: number;
    fail_count: number;
  }
): Promise<MockEvaluationRunResponse> {
  // Simulate network delay and trace creation
  await delay(800);

  const evalRunId = generateEvalRunId();
  const traceCount = 50;

  return {
    eval_run_id: evalRunId,
    eval_run_name: `Evaluation Run ${new Date().toLocaleString()}`,
    created_at: new Date().toISOString(),
    trace_count: traceCount,
    score: aggregatedStats.average_score,
    message: `Evaluation run created with ${traceCount} traces. Score: ${aggregatedStats.average_score.toFixed(2)}`,
  };
}

// ============ MOCK DATA GENERATOR ============

/**
 * Generate mock dataset response (simulates POST /api/dataset/upload-csv)
 * Note: Actual upload still goes to real backend, this just generates response
 */
export function mockGenerateDatasetResponse(rowCount: number = 10): MockDatasetResponse {
  const datasetId = generateDatasetId();
  const duplicatedRowCount = rowCount * 5;

  return {
    dataset_id: datasetId,
    dataset_name: `Dataset-${datasetId}`,
    row_count: rowCount,
    duplicated_row_count: duplicatedRowCount,
    jsonl_path: `/tmp/dataset-${datasetId}.jsonl`,
  };
}

// ============ UNIFIED MOCK API CLIENT ============

/**
 * Unified mock API client that routes requests to appropriate mock functions
 */
export async function mockApiCall(
  endpoint: string,
  method: string,
  body?: Record<string, any>,
  file?: File
): Promise<any> {
  const url = new URL(endpoint, 'http://mock-api');
  const pathname = url.pathname;

  try {
    // Upload endpoint
    if (pathname.includes('/api/upload') && method === 'POST') {
      if (!file) {
        throw new Error('No file provided for upload');
      }
      return await mockHandleFileUpload(file);
    }

    // Batch endpoints
    if (pathname.includes('/api/batch/create-batch') && method === 'POST') {
      return await mockCreateBatch(body?.dataset_id || 'test-dataset');
    }

    if (pathname.match(/\/api\/batch\/[\w-]+\/status/) && method === 'GET') {
      const batchId = pathname.split('/').pop();
      return await mockGetBatchStatus(batchId || '');
    }

    // Embeddings endpoints
    if (pathname.includes('/api/embeddings/process-batch') && method === 'POST') {
      return await mockProcessEmbeddings(body?.batch_id || 'test-batch');
    }

    // Results aggregation endpoints
    if (pathname.includes('/api/results/aggregate') && method === 'POST') {
      return await mockAggregateResults(body?.batch_id || 'test-batch', body?.include_embeddings || false);
    }

    // Langfuse endpoints
    if (pathname.includes('/api/langfuse/create-evaluation-run') && method === 'POST') {
      return await mockCreateEvaluationRun(
        body?.dataset_id || 'test-dataset',
        body?.batch_id,
        body?.aggregated_stats || { average_score: 0.85, pass_count: 45, fail_count: 5 }
      );
    }

    throw new Error(`Mock endpoint not found: ${endpoint}`);
  } catch (error) {
    console.error('Mock API error:', error);
    throw error;
  }
}

// ============ TEST UTILITIES ============

/**
 * Clear all mock data from session storage
 */
export function mockApiClearData(): void {
  const keys = [];
  for (let i = 0; i < sessionStorage.length; i++) {
    const key = sessionStorage.key(i);
    if (key?.startsWith('batch-')) {
      keys.push(key);
    }
  }
  keys.forEach((key) => sessionStorage.removeItem(key));
}

/**
 * Get all stored mock batch data (for debugging)
 */
export function mockApiGetBatchData(batchId: string): any {
  const data = sessionStorage.getItem(`batch-${batchId}`);
  return data ? JSON.parse(data) : null;
}

/**
 * Simulate end-to-end pipeline in one call
 */
export async function mockSimulatePipeline(
  useEmbeddings: boolean = false
): Promise<{
  dataset: MockDatasetResponse;
  batch: MockBatchResponse;
  embeddings?: MockEmbeddingsResponse;
  aggregatedStats: MockAggregateResponse;
  evaluationRun: MockEvaluationRunResponse;
}> {
  console.log('Starting mock pipeline simulation...');

  // Step 1: Create dataset
  const dataset = mockGenerateDatasetResponse(10);
  console.log('✓ Dataset created:', dataset.dataset_id);

  // Step 2: Create batch
  const batch = await mockCreateBatch(dataset.dataset_id);
  console.log('✓ Batch created:', batch.batch_id);

  // Step 3: Wait for batch to complete (simulate polling)
  let batchComplete = false;
  let pollCount = 0;
  while (!batchComplete && pollCount < 50) {
    const status = await mockGetBatchStatus(batch.batch_id);
    if (status.status === 'completed') {
      batchComplete = true;
      console.log('✓ Batch completed after', pollCount, 'polls');
    } else {
      await delay(100); // Poll more frequently for testing
      pollCount++;
    }
  }

  // Step 4: Process embeddings (optional)
  let embeddings: MockEmbeddingsResponse | undefined;
  if (useEmbeddings) {
    embeddings = await mockProcessEmbeddings(batch.batch_id);
    console.log('✓ Embeddings processed:', embeddings.embedding_count, 'traces');
  }

  // Step 5: Aggregate results
  const aggregatedStats = await mockAggregateResults(batch.batch_id, useEmbeddings);
  console.log('✓ Results aggregated:', aggregatedStats.average_score);

  // Step 6: Create evaluation run
  const evaluationRun = await mockCreateEvaluationRun(
    dataset.dataset_id,
    batch.batch_id,
    aggregatedStats
  );
  console.log('✓ Evaluation run created:', evaluationRun.eval_run_id);

  return {
    dataset,
    batch,
    embeddings,
    aggregatedStats,
    evaluationRun,
  };
}
