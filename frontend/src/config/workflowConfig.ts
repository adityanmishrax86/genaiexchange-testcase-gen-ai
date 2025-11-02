/**
 * Workflow Configuration
 *
 * Defines the pre-embedded healthcare test case generation workflow.
 * Nodes are automatically initialized in the correct order with optional features
 * that can be toggled on/off by the user.
 */

export interface WorkflowNode {
  id: string;
  type: 'uploadNode' | 'processorNode' | 'validatorNode' | 'manualNode' | 'integrationNode';
  label: string;
  description: string;
  position: { x: number; y: number };
  data: any;
  optional?: boolean;
  featureKey?: 'includeStandards' | 'includeJudge';
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  hidden?: boolean;
  conditionalFeature?: 'includeStandards' | 'includeJudge';
}

export interface WorkflowConfig {
  includeStandards: boolean;  // Upload standard documents (IEC-62304, FDA, etc.)
  includeJudge: boolean;      // Judge LLM evaluation
}

// Standard layout spacing
const X_OFFSET = 300;  // Horizontal spacing between nodes
const Y_OFFSET = 100;  // Vertical spacing for alternative paths

/**
 * Default workflow nodes in optimal healthcare test case generation order
 */
export const DEFAULT_WORKFLOW_NODES: WorkflowNode[] = [
  // 1. Upload Requirements (MANDATORY)
  {
    id: 'node-1-upload-requirements',
    type: 'uploadNode',
    label: 'Upload Requirements',
    description: 'Upload requirements document (PDF, DOCX, etc.)',
    position: { x: 0, y: 0 },
    data: {
      name: 'Document Upload',
      label: 'Upload requirements (mandatory)',
      processorType: undefined,
      optional: false,
      runnable: false,
    },
  },

  // 2. Extract Requirements (MANDATORY)
  {
    id: 'node-2-extract',
    type: 'processorNode',
    label: 'Extract Requirements',
    description: 'Parse and extract requirements from documents',
    position: { x: X_OFFSET, y: 0 },
    data: {
      name: 'Document Parser',
      label: 'Extract requirements from document',
      processorType: 'parser',
      optional: false,
      runnable: false,
    },
  },

  // 3. Upload Standards (OPTIONAL - can be toggled on/off)
  {
    id: 'node-3-upload-standards',
    type: 'uploadNode',
    label: 'Upload Standards',
    description: 'Upload compliance standards (IEC-62304, FDA, ISO)',
    position: { x: X_OFFSET * 2, y: Y_OFFSET },
    data: {
      name: 'Standards Upload',
      label: 'Upload standards (optional)',
      processorType: undefined,
      optional: true,
      runnable: false,
    },
    optional: true,
    featureKey: 'includeStandards',
  },

  // 4. Generate Tests (MANDATORY)
  {
    id: 'node-4-generate',
    type: 'processorNode',
    label: 'Generate Tests',
    description: 'Generate test cases from requirements',
    position: { x: X_OFFSET * 3, y: 0 },
    data: {
      name: 'Test Generator',
      label: 'Generate test cases from requirements',
      processorType: 'generator',
      optional: false,
      runnable: false,
    },
  },

  // 5. Judge LLM Evaluation (OPTIONAL - can be toggled on/off)
  {
    id: 'node-5-judge',
    type: 'validatorNode',
    label: 'Judge LLM Evaluation',
    description: 'AI-powered quality evaluation with 8-category rubric',
    position: { x: X_OFFSET * 4, y: Y_OFFSET },
    data: {
      name: 'Quality Judge',
      label: 'Validate quality with Judge LLM (optional)',
      optional: true,
      runnable: false,
    },
    optional: true,
    featureKey: 'includeJudge',
  },

  // 6. Human Review (MANDATORY)
  {
    id: 'node-6-review',
    type: 'manualNode',
    label: 'Human Review',
    description: 'Manual review and approval of test cases',
    position: { x: X_OFFSET * 5, y: 0 },
    data: {
      name: 'Human Review',
      label: 'Manual verification and approval',
      optional: false,
      runnable: false,
    },
  },

  // 7. Export to System (MANDATORY)
  {
    id: 'node-7-export',
    type: 'integrationNode',
    label: 'Export to ALM',
    description: 'Push approved test cases to JIRA, Azure DevOps, TestRail, or Polarion',
    position: { x: X_OFFSET * 6, y: 0 },
    data: {
      name: 'JIRA Export',
      label: 'Push to ALM system',
      optional: false,
      runnable: false,
    },
  },
];

/**
 * Default workflow edges that connect all nodes
 * Edges to optional nodes are conditionally rendered based on workflow config
 */
export const DEFAULT_WORKFLOW_EDGES: WorkflowEdge[] = [
  // Upload Requirements → Extract
  {
    id: 'edge-1-2',
    source: 'node-1-upload-requirements',
    target: 'node-2-extract',
  },

  // Extract → Upload Standards (if includeStandards is true)
  {
    id: 'edge-2-3',
    source: 'node-2-extract',
    target: 'node-3-upload-standards',
    conditionalFeature: 'includeStandards',
  },

  // Standards → Generate (if includeStandards is true)
  {
    id: 'edge-3-4',
    source: 'node-3-upload-standards',
    target: 'node-4-generate',
    conditionalFeature: 'includeStandards',
  },

  // Extract → Generate (if includeStandards is false, skip standards)
  {
    id: 'edge-2-4-direct',
    source: 'node-2-extract',
    target: 'node-4-generate',
    conditionalFeature: 'includeStandards', // inverted - use when false
    hidden: true, // starts hidden, shown when includeStandards is false
  },

  // Generate → Judge (if includeJudge is true)
  {
    id: 'edge-4-5',
    source: 'node-4-generate',
    target: 'node-5-judge',
    conditionalFeature: 'includeJudge',
  },

  // Judge → Review (if includeJudge is true)
  {
    id: 'edge-5-6',
    source: 'node-5-judge',
    target: 'node-6-review',
    conditionalFeature: 'includeJudge',
  },

  // Generate → Review (if includeJudge is false, skip judge)
  {
    id: 'edge-4-6-direct',
    source: 'node-4-generate',
    target: 'node-6-review',
    hidden: true, // starts hidden, shown when includeJudge is false
  },

  // Review → Export
  {
    id: 'edge-6-7',
    source: 'node-6-review',
    target: 'node-7-export',
  },
];

/**
 * Filter nodes based on workflow configuration
 */
export function getVisibleNodes(
  nodes: WorkflowNode[],
  config: WorkflowConfig
): WorkflowNode[] {
  return nodes.filter((node) => {
    // Always show non-optional nodes
    if (!node.optional) return true;

    // Show optional nodes based on feature flags
    if (node.featureKey === 'includeStandards') return config.includeStandards;
    if (node.featureKey === 'includeJudge') return config.includeJudge;

    return true;
  });
}

/**
 * Filter edges based on workflow configuration
 * Remove edges that connect to hidden nodes
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
      if (edge.conditionalFeature === 'includeStandards') {
        return config.includeStandards;
      }
      if (edge.conditionalFeature === 'includeJudge') {
        return config.includeJudge;
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
 * Traverses edges to determine the order of node execution
 */
export function buildExecutionSequence(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const sequence: string[] = [];
  const visited = new Set<string>();

  // Find the starting node (upload requirements)
  const startNode = nodes.find((n) => n.id === 'node-1-upload-requirements');
  if (!startNode) return [];

  // Traverse the graph depth-first
  const traverse = (nodeId: string) => {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    sequence.push(nodeId);

    // Find all outgoing edges
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
 * Initialize workflow with default configuration
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
