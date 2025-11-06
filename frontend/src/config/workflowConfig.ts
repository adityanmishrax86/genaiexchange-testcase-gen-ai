/**
 * Workflow Configuration - LLM Evaluation Pipeline
 *
 * 5-Stage Data Pipeline for LLM Evaluation:
 * 1. Dataset Handler (steps 1-3): Upload CSV → Langfuse Dataset → Build JSONL
 * 2. LLM Runner (steps 4-10): Upload JSONL → OpenAI Batch → Celery Poll → Download results
 * 3. Module Executor (steps 11-15): Build Embedding JSONL → OpenAI Embeddings → Poll → Cosine similarity
 * 4. Results Aggregator (step 16): Calculate stats (avg, min, max, std) → Update eval_run.score
 * 5. Langfuse Logger (steps 2, 10, 16): Create EvaluationRun → Create traces → Update traces with scores
 */

export type NodeType =
  | 'datasetHandler'
  | 'llmRunner'
  | 'moduleExecutor'
  | 'resultsAggregator'
  | 'langfuseLogger';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  description: string;
  position: { x: number; y: number };
  data: any;
  optional?: boolean;
  featureKey?: 'includeEmbeddings' | 'includeAdvancedStats';
  stage: 'datasetHandler' | 'llmRunner' | 'moduleExecutor' | 'resultsAggregator' | 'langfuseLogger';
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  hidden?: boolean;
  conditionalFeature?: 'includeEmbeddings' | 'includeAdvancedStats';
}

/**
 * Feature toggles for the evaluation pipeline
 */
export interface WorkflowConfig {
  includeEmbeddings: boolean;      // Include semantic similarity module executor (optional)
  includeAdvancedStats: boolean;   // Include advanced statistics in results aggregator (optional)
}

// Standard layout spacing
const X_OFFSET = 300;  // Horizontal spacing between nodes
const Y_OFFSET = 100;  // Vertical spacing for alternative paths

/**
 * Default workflow nodes for LLM Evaluation Pipeline
 *
 * 5-Stage Pipeline:
 * 1. Dataset Handler: CSV upload → Langfuse duplication → JSONL building
 * 2. LLM Runner: JSONL upload → OpenAI batch creation → polling → result download
 * 3. Module Executor: Embedding JSONL → semantic similarity (optional)
 * 4. Results Aggregator: Statistics calculation → eval_run.score update
 * 5. Langfuse Logger: Evaluation tracing and logging
 */
export const DEFAULT_WORKFLOW_NODES: WorkflowNode[] = [
  // STAGE 1: DATASET HANDLER (Steps 1-3)
  // Upload CSV → Langfuse Dataset Creation (5x duplication) → Build JSONL for OpenAI
  {
    id: 'node-1-dataset-handler',
    type: 'datasetHandler',
    label: 'Dataset Handler',
    description: 'Upload CSV → Create Langfuse Dataset with 5x duplication → Build JSONL',
    position: { x: 0, y: 0 },
    stage: 'datasetHandler',
    data: {
      name: 'Dataset Handler',
      label: 'Step 1-3: Upload CSV, create Langfuse dataset, build JSONL',
      processorType: 'datasetHandler',
      optional: false,
      runnable: false,
      substeps: [
        { step: 1, name: 'Upload CSV to backend' },
        { step: 2, name: 'Create Langfuse Dataset (5x duplication)' },
        { step: 3, name: 'Build JSONL for OpenAI Batch API' },
      ],
    },
  },

  // STAGE 2: LLM RUNNER (Steps 4-10)
  // Upload JSONL → OpenAI Files API → Create Batch → Celery Poll → Download Results
  {
    id: 'node-2-llm-runner',
    type: 'llmRunner',
    label: 'LLM Runner',
    description: 'Upload JSONL → OpenAI Batch API → Poll for completion → Download results',
    position: { x: X_OFFSET, y: 0 },
    stage: 'llmRunner',
    data: {
      name: 'LLM Runner',
      label: 'Step 4-10: Run OpenAI batch, wait for completion, download results',
      processorType: 'llmRunner',
      optional: false,
      runnable: false,
      substeps: [
        { step: 4, name: 'Upload JSONL via OpenAI Files API' },
        { step: 5, name: 'Create batch with OpenAI Batch API' },
        { step: 6, name: 'Return batch_id to frontend' },
        { step: 7, name: 'Celery Beat polls batch status (1-24hrs)' },
        { step: 8, name: 'Log polling progress to Langfuse' },
        { step: 9, name: 'Batch completes, download result file' },
        { step: 10, name: 'Parse and validate results' },
      ],
    },
  },

  // STAGE 3: MODULE EXECUTOR (Steps 11-15) - OPTIONAL
  // Build Embedding JSONL → OpenAI Embeddings API → Poll → Calculate Cosine Similarity
  {
    id: 'node-3-module-executor',
    type: 'moduleExecutor',
    label: 'Embedding Module',
    description: 'Build embedding JSONL → OpenAI Embeddings → Calculate semantic similarity',
    position: { x: X_OFFSET * 2, y: 100 },
    stage: 'moduleExecutor',
    optional: true,
    featureKey: 'includeEmbeddings',
    data: {
      name: 'Embedding Module',
      label: 'Step 11-15: Embeddings & semantic similarity (optional)',
      processorType: 'moduleExecutor',
      optional: true,
      runnable: false,
      substeps: [
        { step: 11, name: 'Build embedding JSONL' },
        { step: 12, name: 'Upload via OpenAI Embeddings API' },
        { step: 13, name: 'Celery Beat polls completion' },
        { step: 14, name: 'Download embedding results' },
        { step: 15, name: 'Calculate cosine similarity per trace' },
      ],
    },
  },

  // STAGE 4: RESULTS AGGREGATOR (Step 16)
  // Calculate aggregate stats (avg, min, max, std) → Update eval_run.score
  {
    id: 'node-4-results-aggregator',
    type: 'resultsAggregator',
    label: 'Results Aggregator',
    description: 'Calculate aggregate statistics → Update eval_run score',
    position: { x: X_OFFSET * 3, y: 0 },
    stage: 'resultsAggregator',
    data: {
      name: 'Results Aggregator',
      label: 'Step 16: Aggregate results & update eval_run.score',
      processorType: 'resultsAggregator',
      optional: false,
      runnable: false,
      substeps: [
        { step: 16, name: 'Calculate aggregate stats (avg, min, max, std)' },
        { step: 16, name: 'Update eval_run.score' },
      ],
    },
  },

  // STAGE 5: LANGFUSE LOGGER
  // Create EvaluationRun → Create traces for each QnA → Update traces with scores
  {
    id: 'node-5-langfuse-logger',
    type: 'langfuseLogger',
    label: 'Langfuse Logger',
    description: 'Create evaluation run → Log traces → Update with scores',
    position: { x: X_OFFSET * 4, y: 0 },
    stage: 'langfuseLogger',
    data: {
      name: 'Langfuse Logger',
      label: 'Step 2, 10, 16: Create traces, log evaluations',
      processorType: 'langfuseLogger',
      optional: false,
      runnable: false,
      substeps: [
        { step: 2, name: 'Create EvaluationRun (after dataset)' },
        { step: 10, name: 'Create traces for each QnA (after LLM)' },
        { step: 16, name: 'Update traces with final scores (after aggregation)' },
      ],
    },
  },
];

/**
 * Default workflow edges for LLM Evaluation Pipeline
 *
 * Linear flow: DatasetHandler → LLMRunner → [ModuleExecutor] → ResultsAggregator → LangfuseLogger
 * Module executor is optional and bypassed when feature is disabled
 */
export const DEFAULT_WORKFLOW_EDGES: WorkflowEdge[] = [
  // 1. Dataset Handler → LLM Runner
  {
    id: 'edge-1-2',
    source: 'node-1-dataset-handler',
    target: 'node-2-llm-runner',
  },

  // 2. LLM Runner → Module Executor (CONDITIONAL - includeEmbeddings)
  {
    id: 'edge-2-3',
    source: 'node-2-llm-runner',
    target: 'node-3-module-executor',
    conditionalFeature: 'includeEmbeddings',
  },

  // 3a. LLM Runner → Results Aggregator (DIRECT, when Module Executor is disabled)
  {
    id: 'edge-2-4-direct',
    source: 'node-2-llm-runner',
    target: 'node-4-results-aggregator',
    conditionalFeature: undefined, // Always show but may be hidden if embeddings enabled
  },

  // 3b. Module Executor → Results Aggregator (CONDITIONAL - includeEmbeddings)
  {
    id: 'edge-3-4',
    source: 'node-3-module-executor',
    target: 'node-4-results-aggregator',
    conditionalFeature: 'includeEmbeddings',
  },

  // 4. Results Aggregator → Langfuse Logger
  {
    id: 'edge-4-5',
    source: 'node-4-results-aggregator',
    target: 'node-5-langfuse-logger',
  },
];

/**
 * Filter nodes based on workflow configuration
 * Always show mandatory nodes, conditionally show optional nodes
 */
export function getVisibleNodes(
  nodes: WorkflowNode[],
  config: WorkflowConfig
): WorkflowNode[] {
  return nodes.filter((node) => {
    // Always show non-optional nodes
    if (!node.optional) return true;

    // Show optional nodes based on feature flags
    if (node.featureKey === 'includeEmbeddings') return config.includeEmbeddings;
    if (node.featureKey === 'includeAdvancedStats') return config.includeAdvancedStats;

    return true;
  });
}

/**
 * Filter edges based on workflow configuration
 * Removes edges that:
 * 1. Connect to hidden nodes
 * 2. Have conditional features that are disabled
 * 3. Duplicate paths when optional modules are disabled
 */
export function getVisibleEdges(
  edges: WorkflowEdge[],
  config: WorkflowConfig,
  visibleNodeIds: Set<string>
): WorkflowEdge[] {
  return edges
    .filter((edge) => {
      // Remove edges connecting to hidden nodes
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) {
        return false;
      }

      // Handle conditional edges
      if (edge.conditionalFeature === 'includeEmbeddings') {
        return config.includeEmbeddings;
      }
      if (edge.conditionalFeature === 'includeAdvancedStats') {
        return config.includeAdvancedStats;
      }

      // For the direct path edge (2→4), hide it if embeddings are enabled
      if (edge.id === 'edge-2-4-direct' && config.includeEmbeddings) {
        return false;
      }

      return true;
    })
    .map((edge) => ({
      ...edge,
      animated: true,
      style: { stroke: '#6b7280', strokeWidth: 2 },
      markerEnd: { type: 'default' },
    }));
}

/**
 * Build the complete node sequence for workflow execution
 * Traverses edges depth-first to determine the order of node execution
 * Starts from Dataset Handler node (entry point)
 */
export function buildExecutionSequence(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sequence: string[] = [];
  const visited = new Set<string>();

  // Find the starting node (Dataset Handler)
  const startNode = nodes.find((n) => n.id === 'node-1-dataset-handler');
  if (!startNode) return [];

  // Traverse the graph depth-first to build execution sequence
  const traverse = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    sequence.push(nodeId);

    // Find all outgoing edges from current node
    const outgoingEdges = edges.filter((e) => e.source === nodeId);
    for (const edge of outgoingEdges) {
      if (nodeMap.has(edge.target)) {
        traverse(edge.target);
      }
    }
  };

  traverse(startNode.id);
  return sequence;
}

/**
 * Initialize workflow with configuration
 * Returns nodes, edges, and execution sequence based on feature toggles
 */
export function initializeWorkflow(config: WorkflowConfig) {
  const visibleNodes = getVisibleNodes(DEFAULT_WORKFLOW_NODES, config);
  const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = getVisibleEdges(DEFAULT_WORKFLOW_EDGES, config, visibleNodeIds);

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    executionSequence: buildExecutionSequence(visibleNodes, visibleEdges),
  };
}
