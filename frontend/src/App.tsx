/**
 * App.tsx - LLM Evaluation Pipeline
 *
 * 5-Stage Pipeline for LLM Evaluation with Langfuse Tracing:
 * 1. Dataset Handler: CSV → Langfuse dataset (5x duplication) → JSONL
 * 2. LLM Runner: JSONL → OpenAI batch → polling → results
 * 3. Module Executor: Embeddings (optional) → semantic similarity
 * 4. Results Aggregator: Statistics calculation → eval_run.score
 * 5. Langfuse Logger: Evaluation tracing and logging
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Controls,
  Background,
  MiniMap,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { WorkflowProvider, useWorkflow } from './context/WorkflowContext';
import WorkflowSettings from './components/WorkflowSettings';
import {
  DatasetHandlerNode,
  LLMRunnerNode,
  ModuleExecutorNode,
  ResultsAggregatorNode,
  LangfuseLoggerNode,
} from './components/WorkflowNodes';
import {
  WorkflowConfig,
  initializeWorkflow,
} from './config/workflowConfig';
import { useMockApi } from './hooks/useMockApi';

// Node type mappings for the 5-stage pipeline
const nodeTypes = {
  datasetHandler: DatasetHandlerNode,
  llmRunner: LLMRunnerNode,
  moduleExecutor: ModuleExecutorNode,
  resultsAggregator: ResultsAggregatorNode,
  langfuseLogger: LangfuseLoggerNode,
};

// ============ MAIN WORKFLOW COMPONENT ============
function WorkflowCanvas() {
  const { state } = useWorkflow();
  const reactFlowWrapper = useRef(null);
  const navigate = useNavigate();
  const { isMockEnabled, toggleMock } = useMockApi();

  // Enable mock API by default on first load
  useEffect(() => {
    const hasInitialized = localStorage.getItem('mockApiInitialized');
    if (!hasInitialized) {
      localStorage.setItem('mockApiEnabled', 'true');
      localStorage.setItem('mockApiInitialized', 'true');
      window.location.reload(); // Reload to apply mock API state
    }
  }, []);

  // Workflow configuration for optional features
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig>({
    includeEmbeddings: false,
    includeAdvancedStats: false,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Initialize default workflow
  const initialWorkflow = initializeWorkflow(workflowConfig);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialWorkflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialWorkflow.edges);
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'running' | 'completed'>('idle');

  // Metrics tracking for the pipeline
  const [metrics, setMetrics] = useState({
    datasetRows: 0,
    batchId: '',
    avgScore: 0,
    traceCount: 0,
  });

  // Update workflow when config changes
  useEffect(() => {
    const newWorkflow = initializeWorkflow(workflowConfig);
    setNodes(newWorkflow.nodes);
    setEdges(newWorkflow.edges);
  }, [workflowConfig, setNodes, setEdges]);

  // Update metrics when workflow state changes
  useEffect(() => {
    setMetrics({
      datasetRows: state.dataset?.duplicatedRowCount || 0,
      batchId: state.batch?.batchId || '',
      avgScore: state.aggregatedStats?.averageScore || 0,
      traceCount: state.evaluationRun?.traceCount || 0,
    });
  }, [state]);

  const onConnect = useCallback(
    (params) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#6b7280', strokeWidth: 2 },
          },
          eds
        )
      );
    },
    [setEdges]
  );

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      // Drop functionality disabled - using preset workflow
    },
    []
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const resetWorkflow = useCallback(() => {
    const newWorkflow = initializeWorkflow(workflowConfig);
    setNodes(newWorkflow.nodes);
    setEdges(newWorkflow.edges);
    setWorkflowStatus('idle');
    setMetrics({
      datasetRows: 0,
      batchId: '',
      avgScore: 0,
      traceCount: 0,
    });
  }, [workflowConfig, setNodes, setEdges]);

  // Workflow execution - auto-run through nodes sequentially
  const runWorkflow = useCallback(async () => {
    setWorkflowStatus('running');

    // Find the sequence of visible nodes from dataset handler onward
    const datasetNode = nodes.find((n) => n.type === 'datasetHandler');
    if (!datasetNode) {
      alert('Dataset handler node not found');
      setWorkflowStatus('idle');
      return;
    }

    let nodeSequence: string[] = [datasetNode.id];
    let currentId = datasetNode.id;

    const findNextNode = (sourceId: string) => {
      const edge = edges.find((e) => e.source === sourceId);
      if (edge) {
        nodeSequence.push(edge.target);
        findNextNode(edge.target);
      }
    };

    findNextNode(currentId);

    // Process nodes sequentially with delays
    for (let i = 0; i < nodeSequence.length; i++) {
      const nodeId = nodeSequence[i];

      // Mark node as processing
      setNodes((nds) =>
        nds.map((node) => ({
          ...node,
          data: {
            ...node.data,
            processing: node.id === nodeId,
          },
        }))
      );

      // Wait for user interaction or auto-process
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    setWorkflowStatus('completed');
  }, [nodes, edges, setNodes]);

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-pink-600 text-white shadow-lg p-4 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Kaapi Konsole</h1>
            <p className="text-sm text-indigo-100">A Tech4Dev Product</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Status:</span>
              <span
                className={`text-sm font-bold px-3 py-1 rounded-full ${workflowStatus === 'idle'
                  ? 'bg-gray-400'
                  : workflowStatus === 'running'
                    ? 'bg-yellow-400 animate-pulse'
                    : 'bg-green-400'
                  }`}
              >
                {workflowStatus.toUpperCase()}
              </span>
            </div>
            <button
              onClick={toggleMock}
              className={`px-3 py-2 rounded-lg transition-colors font-semibold text-xs ${
                isMockEnabled
                  ? 'bg-green-500 text-white hover:bg-green-600'
                  : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
              }`}
              title={isMockEnabled ? 'Mock API Enabled (Click to use Real API)' : 'Real API (Click to use Mock API)'}
            >
              {isMockEnabled ? '🟢 MOCK' : '🔴 REAL'}
            </button>
            <button
              onClick={() => navigate('/lazy-eval')}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
              title="Switch to Simplified Eval"
            >
              🚀 Quick Eval
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 bg-white text-blue-600 rounded-lg hover:bg-gray-100 transition-colors"
              title="Workflow Settings"
            >
              ⚙️ Settings
            </button>
            <button
              onClick={runWorkflow}
              disabled={workflowStatus === 'running'}
              className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-gray-400 transition-colors font-semibold"
            >
              ▶ Run Workflow
            </button>
            <button
              onClick={resetWorkflow}
              className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors"
            >
              ↻ Reset
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Dashboard */}
      <div className="bg-white shadow p-4 border-b">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Pipeline Metrics</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
              <div className="text-3xl font-bold text-indigo-600">{metrics.datasetRows}</div>
              <div className="text-sm text-gray-600">Dataset Rows (5x duplicated)</div>
            </div>
            <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
              <div className="text-3xl font-bold text-amber-600">{metrics.batchId ? '✓' : '—'}</div>
              <div className="text-sm text-gray-600">Batch Status</div>
            </div>
            <div className="bg-violet-50 p-4 rounded-lg border border-violet-200">
              <div className="text-3xl font-bold text-violet-600">{metrics.avgScore.toFixed(2)}</div>
              <div className="text-sm text-gray-600">Average Score</div>
            </div>
            <div className="bg-pink-50 p-4 rounded-lg border border-pink-200">
              <div className="text-3xl font-bold text-pink-600">{metrics.traceCount}</div>
              <div className="text-sm text-gray-600">Langfuse Traces</div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Canvas */}
      <div className="flex-1 overflow-hidden" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background variant="dots" gap={12} size={1} color="#000000" />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const colors = {
                datasetHandler: '#6366f1',
                llmRunner: '#d97706',
                moduleExecutor: '#14b8a6',
                resultsAggregator: '#8b5cf6',
                langfuseLogger: '#ec4899',
              };
              return colors[node.type] || '#6b7280';
            }}
          />

          {/* Help Panel */}
          <Panel position="top-left" className="bg-white p-4 rounded-lg shadow-lg max-w-xs">
            <h3 className="font-bold mb-2 text-gray-800">5-Stage Pipeline</h3>
            <ol className="text-xs text-gray-600 space-y-1">
              <li>📊 <strong>Stage 1:</strong> Upload CSV → Langfuse dataset (5x)</li>
              <li>⚙️ <strong>Stage 2:</strong> OpenAI batch creation & polling</li>
              <li>📈 <strong>Stage 3:</strong> Embeddings & similarity (optional)</li>
              <li>📊 <strong>Stage 4:</strong> Aggregate statistics</li>
              <li>📝 <strong>Stage 5:</strong> Langfuse evaluation logging</li>
            </ol>
          </Panel>
        </ReactFlow>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <WorkflowSettings
          config={workflowConfig}
          onConfigChange={setWorkflowConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}

// ============ ROOT APP WITH PROVIDER ============
export default function App() {
  return (
    <ReactFlowProvider>
      <WorkflowProvider>
        <WorkflowCanvas />
      </WorkflowProvider>
    </ReactFlowProvider>
  );
}
