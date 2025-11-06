/**
 * WorkflowContext.tsx
 *
 * Manages shared workflow state across all nodes.
 * Handles 5-stage LLM Evaluation Pipeline:
 * 1. Dataset Handler: CSV → Langfuse Dataset (5x duplication) → JSONL
 * 2. LLM Runner: JSONL → OpenAI Batch → Poll → Results
 * 3. Module Executor: Embeddings JSONL → OpenAI Embeddings → Cosine similarity
 * 4. Results Aggregator: Statistics (avg, min, max, std) → eval_run.score
 * 5. Langfuse Logger: EvaluationRun → Traces → Score updates
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

// ============ TYPE DEFINITIONS ============

/** Dataset from CSV upload and Langfuse creation */
export interface DatasetInfo {
  datasetId: string;
  name: string;
  rowCount: number;
  duplicatedRowCount: number;
}

/** OpenAI Batch information */
export interface BatchInfo {
  batchId: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  inputFileId: string;
  outputFileId: string | null;
  createdAt: string;
  completedAt: string | null;
}

/** Embedding results with semantic similarity scores */
export interface EmbeddingResult {
  traceId: string;
  embeddings: number[];
  cosineSimilarity?: number;
}

/** Evaluation run tracking */
export interface EvaluationRunInfo {
  evalRunId: string;
  name: string;
  createdAt: string;
  traceCount: number;
  score: number | null;
}

/** Aggregated evaluation statistics */
export interface AggregatedStats {
  averageScore: number;
  minScore: number;
  maxScore: number;
  stdDeviation: number;
  passCount: number;
  failCount: number;
}

export interface WorkflowState {
  // Stage 1: Dataset Handler
  dataset: DatasetInfo | null;
  csvError: string | null;

  // Stage 2: LLM Runner
  batch: BatchInfo | null;
  batchPollingStatus: 'idle' | 'polling' | 'completed' | 'failed';
  batchError: string | null;

  // Stage 3: Module Executor (Optional)
  embeddings: EmbeddingResult[];
  embeddingsError: string | null;

  // Stage 4: Results Aggregator
  aggregatedStats: AggregatedStats | null;
  aggregationError: string | null;

  // Stage 5: Langfuse Logger
  evaluationRun: EvaluationRunInfo | null;
  langfuseError: string | null;

  // General tracking
  currentStage: 'idle' | 'datasetHandler' | 'llmRunner' | 'moduleExecutor' | 'resultsAggregator' | 'langfuseLogger';
}

export interface WorkflowContextType {
  state: WorkflowState;

  // Stage 1: Dataset Handler
  setDataset: (dataset: DatasetInfo) => void;
  setCsvError: (error: string | null) => void;

  // Stage 2: LLM Runner
  setBatch: (batch: BatchInfo) => void;
  setBatchPollingStatus: (status: 'idle' | 'polling' | 'completed' | 'failed') => void;
  setBatchError: (error: string | null) => void;

  // Stage 3: Module Executor
  setEmbeddings: (embeddings: EmbeddingResult[]) => void;
  setEmbeddingsError: (error: string | null) => void;

  // Stage 4: Results Aggregator
  setAggregatedStats: (stats: AggregatedStats) => void;
  setAggregationError: (error: string | null) => void;

  // Stage 5: Langfuse Logger
  setEvaluationRun: (run: EvaluationRunInfo) => void;
  setLangfuseError: (error: string | null) => void;

  // General
  setCurrentStage: (stage: WorkflowState['currentStage']) => void;
  reset: () => void;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

const initialState: WorkflowState = {
  // Stage 1: Dataset Handler
  dataset: null,
  csvError: null,

  // Stage 2: LLM Runner
  batch: null,
  batchPollingStatus: 'idle',
  batchError: null,

  // Stage 3: Module Executor
  embeddings: [],
  embeddingsError: null,

  // Stage 4: Results Aggregator
  aggregatedStats: null,
  aggregationError: null,

  // Stage 5: Langfuse Logger
  evaluationRun: null,
  langfuseError: null,

  // General
  currentStage: 'idle',
};

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkflowState>(initialState);

  // ============ Stage 1: Dataset Handler ============

  const setDataset = useCallback((dataset: DatasetInfo) => {
    setState((prev) => ({
      ...prev,
      dataset,
      csvError: null,
    }));
  }, []);

  const setCsvError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      csvError: error,
    }));
  }, []);

  // ============ Stage 2: LLM Runner ============

  const setBatch = useCallback((batch: BatchInfo) => {
    setState((prev) => ({
      ...prev,
      batch,
      batchError: null,
    }));
  }, []);

  const setBatchPollingStatus = useCallback((status: 'idle' | 'polling' | 'completed' | 'failed') => {
    setState((prev) => ({
      ...prev,
      batchPollingStatus: status,
    }));
  }, []);

  const setBatchError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      batchError: error,
    }));
  }, []);

  // ============ Stage 3: Module Executor ============

  const setEmbeddings = useCallback((embeddings: EmbeddingResult[]) => {
    setState((prev) => ({
      ...prev,
      embeddings,
      embeddingsError: null,
    }));
  }, []);

  const setEmbeddingsError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      embeddingsError: error,
    }));
  }, []);

  // ============ Stage 4: Results Aggregator ============

  const setAggregatedStats = useCallback((stats: AggregatedStats) => {
    setState((prev) => ({
      ...prev,
      aggregatedStats: stats,
      aggregationError: null,
    }));
  }, []);

  const setAggregationError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      aggregationError: error,
    }));
  }, []);

  // ============ Stage 5: Langfuse Logger ============

  const setEvaluationRun = useCallback((run: EvaluationRunInfo) => {
    setState((prev) => ({
      ...prev,
      evaluationRun: run,
      langfuseError: null,
    }));
  }, []);

  const setLangfuseError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      langfuseError: error,
    }));
  }, []);

  // ============ General ============

  const setCurrentStage = useCallback((stage: WorkflowState['currentStage']) => {
    setState((prev) => ({
      ...prev,
      currentStage: stage,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const value: WorkflowContextType = {
    state,
    setDataset,
    setCsvError,
    setBatch,
    setBatchPollingStatus,
    setBatchError,
    setEmbeddings,
    setEmbeddingsError,
    setAggregatedStats,
    setAggregationError,
    setEvaluationRun,
    setLangfuseError,
    setCurrentStage,
    reset,
  };

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow(): WorkflowContextType {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within WorkflowProvider');
  }
  return context;
}
