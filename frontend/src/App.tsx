/**
 * App.tsx - Refactored Version
 *
 * Healthcare AI Test Case Generator with integrated backend APIs.
 * Uses pre-built workflow with configurable optional features.
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  UploadNodeComponent,
  ExtractNodeComponent,
  ReviewNodeComponent,
  GenerateNodeComponent,
  JudgeNodeComponent,
  ApproveNodeComponent,
  JiraPushNodeComponent,
} from './components/WorkflowNodes';
import {
  DEFAULT_WORKFLOW_NODES,
  DEFAULT_WORKFLOW_EDGES,
  WorkflowConfig,
  initializeWorkflow,
} from './config/workflowConfig';

// Node type mappings
const nodeTypes = {
  upload: UploadNodeComponent,
  extract: ExtractNodeComponent,
  review: ReviewNodeComponent,
  generate: GenerateNodeComponent,
  judge: JudgeNodeComponent,
  approve: ApproveNodeComponent,
  jiraPush: JiraPushNodeComponent,
};

// ============ MAIN WORKFLOW COMPONENT ============
function WorkflowCanvas() {
  const { state } = useWorkflow();
  const reactFlowWrapper = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // Workflow configuration and initialization
  const [workflowConfig, setWorkflowConfig] = useState<WorkflowConfig>({
    includeStandards: false,
    includeJudge: true,
  });
  const [showSettings, setShowSettings] = useState(false);

  // Initialize default workflow
  const initialWorkflow = initializeWorkflow(workflowConfig);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialWorkflow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialWorkflow.edges);
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'running' | 'completed'>('idle');

  // Metrics tracking
  const [metrics, setMetrics] = useState({
    requirementsCount: 0,
    testCasesCount: 0,
    verdictCount: 0,
    pushedCount: 0,
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
      requirementsCount: state.requirements.length,
      testCasesCount: state.testCases.length,
      verdictCount: state.judgeVerdicts.length,
      pushedCount: state.jiraResult?.created_issues_count || 0,
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
      requirementsCount: 0,
      testCasesCount: 0,
      verdictCount: 0,
      pushedCount: 0,
    });
  }, [workflowConfig, setNodes, setEdges]);

  // Workflow execution - auto-run through nodes sequentially
  const runWorkflow = useCallback(async () => {
    setWorkflowStatus('running');

    // Find the sequence of visible nodes from upload to JIRA
    const uploadNode = nodes.find((n) => n.type === 'upload');
    if (!uploadNode) {
      alert('Upload node not found');
      setWorkflowStatus('idle');
      return;
    }

    let nodeSequence: string[] = [uploadNode.id];
    let currentId = uploadNode.id;

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
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg p-4 z-10">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Healthcare Test Case Generator</h1>
            <p className="text-sm text-blue-100">AI-Powered Compliance Testing with FDA & IEC-62304</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm">Status:</span>
              <span
                className={`text-sm font-bold px-3 py-1 rounded-full ${
                  workflowStatus === 'idle'
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
          <h2 className="text-lg font-semibold mb-3 text-gray-800">Workflow Metrics</h2>
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
              <div className="text-3xl font-bold text-blue-600">{metrics.requirementsCount}</div>
              <div className="text-sm text-gray-600">Requirements Extracted</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200">
              <div className="text-3xl font-bold text-green-600">{metrics.testCasesCount}</div>
              <div className="text-sm text-gray-600">Test Cases Generated</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
              <div className="text-3xl font-bold text-yellow-600">{metrics.verdictCount}</div>
              <div className="text-sm text-gray-600">Quality Verdicts</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
              <div className="text-3xl font-bold text-purple-600">{metrics.pushedCount}</div>
              <div className="text-sm text-gray-600">JIRA Issues Pushed</div>
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
          <Background variant="dots" gap={12} size={1} />
          <Controls />
          <MiniMap
            nodeColor={(node) => {
              const colors = {
                upload: '#3b82f6',
                extract: '#10b981',
                review: '#9333ea',
                generate: '#10b981',
                judge: '#eab308',
                approve: '#9333ea',
                jiraPush: '#ef4444',
              };
              return colors[node.type] || '#6b7280';
            }}
          />

          {/* Help Panel */}
          <Panel position="top-left" className="bg-white p-4 rounded-lg shadow-lg max-w-xs">
            <h3 className="font-bold mb-2 text-gray-800">Workflow Guide</h3>
            <ol className="text-xs text-gray-600 space-y-1">
              <li>1️⃣ Upload requirements document</li>
              <li>2️⃣ Extract and structure requirements</li>
              <li>3️⃣ Review and approve requirements</li>
              <li>4️⃣ Generate test cases</li>
              <li>5️⃣ Evaluate quality (optional)</li>
              <li>6️⃣ Approve test cases</li>
              <li>7️⃣ Push to JIRA</li>
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
