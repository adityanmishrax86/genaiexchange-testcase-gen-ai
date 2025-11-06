/**
 * WorkflowNodes.tsx - LLM Evaluation Pipeline Nodes
 *
 * 5-Stage Pipeline Node Components:
 * 1. DatasetHandlerNode: CSV upload → Langfuse dataset creation → JSONL building
 * 2. LLMRunnerNode: JSONL upload → OpenAI batch creation → polling → results
 * 3. ModuleExecutorNode: Embedding JSONL → semantic similarity calculation (optional)
 * 4. ResultsAggregatorNode: Statistics aggregation → eval_run.score update
 * 5. LangfuseLoggerNode: Evaluation tracing and logging
 *
 * Each node has a processing function that can be hooked up to backend APIs
 */

import React, { useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useWorkflow } from '../context/WorkflowContext';
import { fetchWithMock } from '../hooks/useMockApi';

// ============ SHARED RESPONSE VIEWER ============
const ResponseViewer = ({ data, title }: { data: any; title: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="cursor-pointer mt-2">
      <summary
        className="font-semibold text-blue-700 hover:text-blue-900"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▼' : '▶'} {title}
      </summary>
      <div className="mt-2 ml-2 bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </details>
  );
};

// ============ STAGE 1: DATASET HANDLER NODE ============
/**
 * Step 1-3: Upload CSV → Create Langfuse Dataset (5x duplication) → Build JSONL for OpenAI
 *
 * Backend hook points:
 * - POST /api/dataset/upload-csv: Upload CSV file
 * - POST /api/dataset/create-langfuse: Create Langfuse dataset with duplication
 * - POST /api/dataset/build-jsonl: Build JSONL for OpenAI batch
 */
export const DatasetHandlerNode = ({ data, isConnectable }: { data: any; isConnectable: boolean }) => {
  const { state, setDataset, setCsvError, setCurrentStage } = useWorkflow();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setCurrentStage('datasetHandler');

    try {
      // Step 1: Upload CSV to backend
      const formData = new FormData();
      formData.append('file', file);

      // This endpoint should handle all 3 steps:
      // 1. Upload CSV file
      // 2. Create Langfuse dataset (with 5x duplication)
      // 3. Build JSONL for OpenAI batch
      const response = await fetch(`${import.meta.env.VITE_API_BASE || '/api'}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Dataset upload failed: ${response.status}`);
      }

      const result = await response.json();
      setResponseData(result);

      // Update workflow state with dataset info
      setDataset({
        datasetId: result.dataset_id,
        name: result.dataset_name,
        rowCount: result.row_count,
        duplicatedRowCount: result.duplicated_row_count,
      });

      if (data.onProcessed) {
        data.onProcessed({
          datasetId: result.dataset_id,
          rowCount: result.row_count,
          duplicatedRowCount: result.duplicated_row_count,
        });
      }
    } catch (err: any) {
      setCsvError(err.message || 'Dataset handler failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasDataset = state.dataset !== null;

  return (
    <div
      className={`bg-indigo-50 border-2 ${hasDataset ? 'border-green-400' : 'border-indigo-300'
        } rounded-lg p-4 min-w-[320px] shadow-lg transition-all ${isProcessing ? 'animate-pulse' : ''
        }`}
    >
      <div className="font-bold text-indigo-900 mb-2">📊 {data.name || 'Dataset Handler'}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>

      {/* Substeps indicator */}
      {data.substeps && (
        <div className="text-xs text-gray-700 mb-3 space-y-1">
          {data.substeps.map((substep: any) => (
            <div key={substep.step} className="flex items-center gap-2">
              <span className="text-gray-500">Step {substep.step}:</span>
              <span>{substep.name}</span>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!hasDataset ? (
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isProcessing}
          className="w-full text-xs bg-indigo-500 text-white p-2 rounded hover:bg-indigo-600 disabled:bg-gray-400 transition-colors font-semibold"
        >
          {isProcessing ? 'Processing...' : '📁 Upload CSV Dataset'}
        </button>
      ) : (
        <div className="bg-green-100 border border-green-400 rounded p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span className="font-semibold text-green-900">Dataset Ready</span>
          </div>
          <div className="text-xs text-green-800 ml-6">
            <div>ID: {state.dataset.datasetId}</div>
            <div>Original rows: {state.dataset.rowCount}</div>
            <div>Duplicated rows: {state.dataset.duplicatedRowCount} (5x)</div>
          </div>
        </div>
      )}

      {state.csvError && (
        <div className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {state.csvError}
        </div>
      )}

      {responseData && <ResponseViewer data={responseData} title="Dataset Response" />}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: hasDataset ? '#22c55e' : '#6366f1' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ STAGE 2: LLM RUNNER NODE ============
/**
 * Step 4-10: Upload JSONL → Create OpenAI Batch → Poll → Download results
 *
 * Backend hook points:
 * - POST /api/batch/upload-jsonl: Upload JSONL file to OpenAI Files API
 * - POST /api/batch/create-batch: Create batch with OpenAI Batch API
 * - GET /api/batch/{batch_id}/status: Poll batch status (used by Celery Beat)
 * - GET /api/batch/{batch_id}/results: Download completed batch results
 */
export const LLMRunnerNode = ({ data, isConnectable }: { data: any; isConnectable: boolean }) => {
  const { state, setBatch, setBatchPollingStatus, setBatchError, setCurrentStage } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);

  const startBatchProcessing = async () => {
    if (!state.dataset) {
      setBatchError('No dataset available. Complete dataset handler first.');
      return;
    }

    setIsProcessing(true);
    setBatchError(null);
    setCurrentStage('llmRunner');
    setBatchPollingStatus('polling');

    try {
      // Step 4-6: Upload JSONL and create batch
      const response = await fetchWithMock(
        `${import.meta.env.VITE_API_BASE || '/api'}/batch/create-batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_id: state.dataset.datasetId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Batch creation failed: ${response.status}`);
      }

      const result = await response.json();
      setResponseData(result);

      // Update batch info in state
      setBatch({
        batchId: result.batch_id,
        status: result.status || 'queued',
        inputFileId: result.input_file_id,
        outputFileId: result.output_file_id || null,
        createdAt: new Date().toISOString(),
        completedAt: null,
      });

      if (data.onProcessed) {
        data.onProcessed({
          batchId: result.batch_id,
          status: result.status,
        });
      }

      // Step 7-9: Start polling batch status (would be handled by Celery Beat in production)
      // Frontend can optionally poll for demo purposes
      pollBatchStatus(result.batch_id);
    } catch (err: any) {
      setBatchError(err.message || 'LLM runner failed');
      setBatchPollingStatus('failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const pollBatchStatus = (batchId: string) => {
    // In production, Celery Beat would handle this polling
    // Frontend can optionally poll for demo/monitoring
    const intervalId = setInterval(async () => {
      try {
        const response = await fetchWithMock(
          `${import.meta.env.VITE_API_BASE || '/api'}/batch/${batchId}/status`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error('Failed to poll batch status');
        }

        const result = await response.json();

        if (result.status === 'completed') {
          setBatchPollingStatus('completed');
          setBatch({
            batchId,
            status: 'completed',
            inputFileId: state.batch?.inputFileId || '',
            outputFileId: result.output_file_id,
            createdAt: state.batch?.createdAt || '',
            completedAt: new Date().toISOString(),
          });
          if (intervalId) clearInterval(intervalId);
        } else if (result.status === 'failed') {
          setBatchPollingStatus('failed');
          setBatchError('Batch processing failed');
          if (intervalId) clearInterval(intervalId);
        }
      } catch (err: any) {
        console.error('Poll error:', err);
      }
    }, 5000); // Poll every 5 seconds for demo
  };

  const hasBatch = state.batch !== null;
  const batchComplete = state.batchPollingStatus === 'completed';

  return (
    <div
      className={`bg-amber-50 border-2 ${batchComplete ? 'border-green-400' : 'border-amber-300'
        } rounded-lg p-4 min-w-[320px] shadow-lg transition-all ${isProcessing ? 'animate-pulse' : ''
        }`}
    >
      <div className="font-bold text-amber-900 mb-2">⚙️ {data.name || 'LLM Runner'}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>

      {/* Substeps indicator */}
      {data.substeps && (
        <div className="text-xs text-gray-700 mb-3 space-y-1">
          {data.substeps.map((substep: any) => (
            <div key={substep.step} className="flex items-center gap-2">
              <span className="text-gray-500">Step {substep.step}:</span>
              <span>{substep.name}</span>
            </div>
          ))}
        </div>
      )}

      {!hasBatch ? (
        <button
          onClick={startBatchProcessing}
          disabled={isProcessing || !state.dataset}
          className="w-full text-xs bg-amber-500 text-white p-2 rounded hover:bg-amber-600 disabled:bg-gray-400 transition-colors font-semibold"
        >
          {isProcessing ? 'Creating batch...' : '🚀 Start OpenAI Batch'}
        </button>
      ) : (
        <div
          className={`${batchComplete ? 'bg-green-100 border-green-400' : 'bg-yellow-100 border-yellow-400'
            } border rounded p-3 space-y-2`}
        >
          <div className="flex items-center gap-2">
            <span className={batchComplete ? 'text-lg' : 'animate-spin'}>
              {batchComplete ? '✓' : '⏳'}
            </span>
            <span className={`font-semibold ${batchComplete ? 'text-green-900' : 'text-yellow-900'}`}>
              {batchComplete ? 'Batch Complete' : 'Batch Processing'}
            </span>
          </div>
          <div className={`text-xs ${batchComplete ? 'text-green-800' : 'text-yellow-800'} ml-6`}>
            <div>Batch ID: {state.batch.batchId}</div>
            <div>Status: {state.batchPollingStatus.toUpperCase()}</div>
            {state.batch.completedAt && <div>Completed: {state.batch.completedAt}</div>}
          </div>
        </div>
      )}

      {state.batchError && (
        <div className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {state.batchError}
        </div>
      )}

      {responseData && <ResponseViewer data={responseData} title="Batch Response" />}

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: batchComplete ? '#22c55e' : '#d97706' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ STAGE 3: MODULE EXECUTOR NODE (Optional) ============
/**
 * Step 11-15: Build embedding JSONL → OpenAI Embeddings → Calculate cosine similarity
 *
 * Backend hook points:
 * - POST /api/embeddings/build-jsonl: Build JSONL for embeddings
 * - POST /api/embeddings/upload: Upload to OpenAI Embeddings API
 * - GET /api/embeddings/{embedding_id}/status: Poll completion
 * - POST /api/embeddings/calculate-similarity: Calculate cosine similarity
 */
export const ModuleExecutorNode = ({ data, isConnectable }: { data: any; isConnectable: boolean }) => {
  const { state, setEmbeddings, setEmbeddingsError, setCurrentStage } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);

  const runEmbeddings = async () => {
    if (!state.batch) {
      setEmbeddingsError('No batch available. Complete LLM runner first.');
      return;
    }

    setIsProcessing(true);
    setEmbeddingsError(null);
    setCurrentStage('moduleExecutor');

    try {
      // Step 11-15: Run embeddings and calculate similarity
      const response = await fetchWithMock(
        `${import.meta.env.VITE_API_BASE || '/api'}/embeddings/process-batch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_id: state.batch.batchId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Embeddings processing failed: ${response.status}`);
      }

      const result = await response.json();
      setResponseData(result);

      // Update embeddings in state
      setEmbeddings(result.embeddings || []);

      if (data.onProcessed) {
        data.onProcessed({
          embeddingCount: result.embeddings?.length || 0,
          avgSimilarity: result.avg_similarity,
        });
      }
    } catch (err: any) {
      setEmbeddingsError(err.message || 'Module executor failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasEmbeddings = state.embeddings.length > 0;

  return (
    <div
      className={`bg-teal-50 border-2 ${hasEmbeddings ? 'border-green-400' : 'border-teal-300'
        } rounded-lg p-4 min-w-[320px] shadow-lg transition-all ${isProcessing ? 'animate-pulse' : ''
        }`}
    >
      <div className="font-bold text-teal-900 mb-2">📈 {data.name || 'Embedding Module'}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>

      {/* Substeps indicator */}
      {data.substeps && (
        <div className="text-xs text-gray-700 mb-3 space-y-1">
          {data.substeps.map((substep: any) => (
            <div key={substep.step} className="flex items-center gap-2">
              <span className="text-gray-500">Step {substep.step}:</span>
              <span>{substep.name}</span>
            </div>
          ))}
        </div>
      )}

      {!hasEmbeddings ? (
        <button
          onClick={runEmbeddings}
          disabled={isProcessing || !state.batch}
          className="w-full text-xs bg-teal-500 text-white p-2 rounded hover:bg-teal-600 disabled:bg-gray-400 transition-colors font-semibold"
        >
          {isProcessing ? 'Computing embeddings...' : '🔬 Run Embeddings'}
        </button>
      ) : (
        <div className="bg-green-100 border border-green-400 rounded p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span className="font-semibold text-green-900">Embeddings Complete</span>
          </div>
          <div className="text-xs text-green-800 ml-6">
            <div>Embeddings: {state.embeddings.length}</div>
            <div>Avg similarity: {state.embeddings[0]?.cosineSimilarity?.toFixed(4) || 'N/A'}</div>
          </div>
        </div>
      )}

      {state.embeddingsError && (
        <div className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {state.embeddingsError}
        </div>
      )}

      {responseData && <ResponseViewer data={responseData} title="Embeddings Response" />}

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: hasEmbeddings ? '#22c55e' : '#14b8a6' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ STAGE 4: RESULTS AGGREGATOR NODE ============
/**
 * Step 16: Calculate aggregate statistics → Update eval_run.score
 *
 * Backend hook points:
 * - POST /api/results/aggregate: Calculate stats and update eval_run
 */
export const ResultsAggregatorNode = ({ data, isConnectable }: { data: any; isConnectable: boolean }) => {
  const { state, setAggregatedStats, setAggregationError, setCurrentStage } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);

  const aggregateResults = async () => {
    if (!state.batch) {
      setAggregationError('No batch available. Complete LLM runner first.');
      return;
    }

    setIsProcessing(true);
    setAggregationError(null);
    setCurrentStage('resultsAggregator');

    try {
      // Step 16: Aggregate results
      const response = await fetchWithMock(
        `${import.meta.env.VITE_API_BASE || '/api'}/results/aggregate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batch_id: state.batch.batchId,
            include_embeddings: state.embeddings.length > 0,
            eval_run_id: state.evaluationRun?.evalRunId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Results aggregation failed: ${response.status}`);
      }

      const result = await response.json();
      setResponseData(result);

      // Update aggregated stats in state
      setAggregatedStats({
        averageScore: result.average_score,
        minScore: result.min_score,
        maxScore: result.max_score,
        stdDeviation: result.std_deviation,
        passCount: result.pass_count,
        failCount: result.fail_count,
      });

      if (data.onProcessed) {
        data.onProcessed({
          averageScore: result.average_score,
          passCount: result.pass_count,
          failCount: result.fail_count,
        });
      }
    } catch (err: any) {
      setAggregationError(err.message || 'Results aggregation failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasStats = state.aggregatedStats !== null;

  return (
    <div
      className={`bg-violet-50 border-2 ${hasStats ? 'border-green-400' : 'border-violet-300'
        } rounded-lg p-4 min-w-[320px] shadow-lg transition-all ${isProcessing ? 'animate-pulse' : ''
        }`}
    >
      <div className="font-bold text-violet-900 mb-2">📊 {data.name || 'Results Aggregator'}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>

      {/* Substeps indicator */}
      {data.substeps && (
        <div className="text-xs text-gray-700 mb-3 space-y-1">
          {data.substeps.map((substep: any) => (
            <div key={substep.step} className="flex items-center gap-2">
              <span className="text-gray-500">Step {substep.step}:</span>
              <span>{substep.name}</span>
            </div>
          ))}
        </div>
      )}

      {!hasStats ? (
        <button
          onClick={aggregateResults}
          disabled={isProcessing || !state.batch}
          className="w-full text-xs bg-violet-500 text-white p-2 rounded hover:bg-violet-600 disabled:bg-gray-400 transition-colors font-semibold"
        >
          {isProcessing ? 'Aggregating...' : '📈 Aggregate Results'}
        </button>
      ) : (
        <div className="bg-green-100 border border-green-400 rounded p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span className="font-semibold text-green-900">Stats Ready</span>
          </div>
          <div className="text-xs text-green-800 ml-6 space-y-1">
            <div>Average: {state.aggregatedStats.averageScore.toFixed(2)}</div>
            <div>Min: {state.aggregatedStats.minScore.toFixed(2)}</div>
            <div>Max: {state.aggregatedStats.maxScore.toFixed(2)}</div>
            <div>Std Dev: {state.aggregatedStats.stdDeviation.toFixed(2)}</div>
            <div>Pass: {state.aggregatedStats.passCount} | Fail: {state.aggregatedStats.failCount}</div>
          </div>
        </div>
      )}

      {state.aggregationError && (
        <div className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {state.aggregationError}
        </div>
      )}

      {responseData && <ResponseViewer data={responseData} title="Aggregation Response" />}

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: hasStats ? '#22c55e' : '#8b5cf6' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ STAGE 5: LANGFUSE LOGGER NODE ============
/**
 * Step 2, 10, 16: Create EvaluationRun → Create traces → Update traces with scores
 *
 * Backend hook points:
 * - POST /api/langfuse/create-evaluation-run: Create EvaluationRun (Step 2)
 * - POST /api/langfuse/create-traces: Create traces for each QnA (Step 10)
 * - PATCH /api/langfuse/update-traces: Update traces with scores (Step 16)
 */
export const LangfuseLoggerNode = ({ data, isConnectable }: { data: any; isConnectable: boolean }) => {
  const { state, setEvaluationRun, setLangfuseError, setCurrentStage } = useWorkflow();
  const [isProcessing, setIsProcessing] = useState(false);
  const [responseData, setResponseData] = useState<any>(null);

  const createEvaluationRun = async () => {
    if (!state.dataset) {
      setLangfuseError('No dataset available. Complete dataset handler first.');
      return;
    }

    setIsProcessing(true);
    setLangfuseError(null);
    setCurrentStage('langfuseLogger');

    try {
      // Steps 2, 10, 16 are handled by backend
      // Frontend initiates the process here
      const response = await fetchWithMock(
        `${import.meta.env.VITE_API_BASE || '/api'}/langfuse/create-evaluation-run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dataset_id: state.dataset.datasetId,
            batch_id: state.batch?.batchId,
            aggregated_stats: state.aggregatedStats,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Langfuse evaluation run creation failed: ${response.status}`);
      }

      const result = await response.json();
      setResponseData(result);

      // Update evaluation run in state
      setEvaluationRun({
        evalRunId: result.eval_run_id,
        name: result.eval_run_name,
        createdAt: result.created_at,
        traceCount: result.trace_count,
        score: result.score || null,
      });

      if (data.onProcessed) {
        data.onProcessed({
          evalRunId: result.eval_run_id,
          traceCount: result.trace_count,
          score: result.score,
        });
      }
    } catch (err: any) {
      setLangfuseError(err.message || 'Langfuse logging failed');
    } finally {
      setIsProcessing(false);
    }
  };

  const hasEvalRun = state.evaluationRun !== null;

  return (
    <div
      className={`bg-pink-50 border-2 ${hasEvalRun ? 'border-green-400' : 'border-pink-300'
        } rounded-lg p-4 min-w-[320px] shadow-lg transition-all ${isProcessing ? 'animate-pulse' : ''
        }`}
    >
      <div className="font-bold text-pink-900 mb-2">📝 {data.name || 'Langfuse Logger'}</div>
      <div className="text-xs text-gray-600 mb-2">{data.label}</div>

      {/* Substeps indicator */}
      {data.substeps && (
        <div className="text-xs text-gray-700 mb-3 space-y-1">
          {data.substeps.map((substep: any) => (
            <div key={`${substep.step}-${substep.name}`} className="flex items-center gap-2">
              <span className="text-gray-500">Step {substep.step}:</span>
              <span>{substep.name}</span>
            </div>
          ))}
        </div>
      )}

      {!hasEvalRun ? (
        <button
          onClick={createEvaluationRun}
          disabled={isProcessing || !state.dataset}
          className="w-full text-xs bg-pink-500 text-white p-2 rounded hover:bg-pink-600 disabled:bg-gray-400 transition-colors font-semibold"
        >
          {isProcessing ? 'Creating evaluation run...' : '📊 Create Evaluation Run'}
        </button>
      ) : (
        <div className="bg-green-100 border border-green-400 rounded p-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">✓</span>
            <span className="font-semibold text-green-900">Evaluation Complete</span>
          </div>
          <div className="text-xs text-green-800 ml-6 space-y-1">
            <div>Eval Run ID: {state.evaluationRun.evalRunId}</div>
            <div>Name: {state.evaluationRun.name}</div>
            <div>Traces: {state.evaluationRun.traceCount}</div>
            {state.evaluationRun.score !== null && (
              <div>Score: {state.evaluationRun.score.toFixed(2)}</div>
            )}
          </div>
        </div>
      )}

      {state.langfuseError && (
        <div className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {state.langfuseError}
        </div>
      )}

      {responseData && <ResponseViewer data={responseData} title="Evaluation Response" />}

      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
      />
    </div>
  );
};
