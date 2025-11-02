/**
 * WorkflowNodes.tsx
 *
 * Pre-built node components for the healthcare test workflow.
 * Each node calls real backend APIs and displays results.
 */

import React, { useState, useRef } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useWorkflowApi } from '../hooks/useWorkflowApi';
import { useWorkflow } from '../context/WorkflowContext';

// ============ UPLOAD NODE ============
export const UploadNodeComponent = ({ data, isConnectable }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isLoading, error, clearError } = useWorkflowApi();
  const { setDocId, setExtractionError } = useWorkflow();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    const file = e.target.files?.[0];
    if (!file) return;

    const result = await uploadFile(file);
    if (result) {
      setDocId(result.doc_id, result.filename);
      setExtractionError(null);
      if (data.onProcessed) data.onProcessed({ doc_id: result.doc_id, filename: result.filename });
    }
  };

  return (
    <div className={`bg-blue-50 border-2 border-blue-300 rounded-lg p-4 min-w-[280px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-blue-900 mb-2">📤 {data.name || 'Upload Requirements'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.csv,.xlsx,.txt"
        onChange={handleFileSelect}
        className="hidden"
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={isLoading}
        className="w-full text-xs bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
      >
        {isLoading ? 'Uploading...' : 'Select File'}
      </button>

      {error && <div className="text-xs text-red-600 mt-2">⚠️ {error}</div>}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#3b82f6' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ EXTRACT NODE ============
export const ExtractNodeComponent = ({ data, isConnectable }) => {
  const { extractRequirements, isLoading, error, clearError } = useWorkflowApi();
  const { state, setRequirements, setExtractionError } = useWorkflow();
  const [showDetails, setShowDetails] = useState(false);

  const handleExtract = async () => {
    clearError();
    if (!state.docId) {
      setExtractionError('No document uploaded');
      return;
    }

    const requirements = await extractRequirements(state.docId);
    if (requirements) {
      setRequirements(requirements);
      if (data.onProcessed) data.onProcessed({ requirement_count: requirements.length });
    } else {
      setExtractionError('Extraction failed');
    }
  };

  const avgConfidence =
    state.requirements.length > 0
      ? (state.requirements.reduce((sum, r) => sum + r.overall_confidence, 0) / state.requirements.length * 100).toFixed(1)
      : 0;

  return (
    <div className={`bg-green-50 border-2 border-green-300 rounded-lg p-4 min-w-[300px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-green-900 mb-2">🔍 {data.name || 'Extract Requirements'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      {!state.requirements.length ? (
        <button
          onClick={handleExtract}
          disabled={isLoading || !state.docId}
          className="w-full text-xs bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors"
        >
          {isLoading ? 'Extracting...' : 'Extract Requirements'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="text-xs bg-green-100 p-2 rounded">
            ✓ {state.requirements.length} requirements extracted
          </div>
          <div className="text-xs text-gray-700">
            Average confidence: <span className="font-semibold">{avgConfidence}%</span>
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>

          {showDetails && (
            <div className="max-h-40 overflow-y-auto bg-white border rounded p-2 text-xs">
              <div className="space-y-1">
                {state.requirements.map((req) => (
                  <div key={req.id} className="text-xs border-b pb-1">
                    <div className="font-semibold text-gray-700 truncate">{req.raw_text.substring(0, 50)}...</div>
                    <div className="text-gray-500">Confidence: {(req.overall_confidence * 100).toFixed(0)}%</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2">⚠️ {error}</div>}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#10b981' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#10b981' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ REVIEW NODE ============
export const ReviewNodeComponent = ({ data, isConnectable }) => {
  const { approveRequirement, isLoading } = useWorkflowApi();
  const { state, approveRequirement: contextApprove } = useWorkflow();
  const [approving, setApproving] = useState<number | null>(null);

  const handleApproveReq = async (reqId: number) => {
    setApproving(reqId);
    const success = await approveRequirement(reqId);
    if (success) {
      contextApprove(reqId);
    }
    setApproving(null);
  };

  const approvedCount = state.approvedRequirementIds.size;
  const totalCount = state.requirements.length;
  const allApproved = totalCount > 0 && approvedCount === totalCount;

  return (
    <div className={`bg-purple-50 border-2 border-purple-300 rounded-lg p-4 min-w-[320px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-purple-900 mb-2">👤 {data.name || 'Review Requirements'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      {state.requirements.length === 0 ? (
        <div className="text-xs text-gray-500">No requirements to review</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs bg-purple-100 p-2 rounded">
            {approvedCount}/{totalCount} approved {allApproved && '✓'}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {state.requirements.map((req) => (
              <div
                key={req.id}
                className={`text-xs p-2 rounded border flex justify-between items-center ${
                  state.approvedRequirementIds.has(req.id) ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200'
                }`}
              >
                <div className="flex-1 truncate">
                  <div className="font-semibold truncate">{req.raw_text.substring(0, 40)}...</div>
                  <div className="text-gray-500">ID: {req.id}</div>
                </div>
                <button
                  onClick={() => handleApproveReq(req.id)}
                  disabled={approving === req.id || state.approvedRequirementIds.has(req.id)}
                  className={`ml-2 px-2 py-1 rounded text-xs whitespace-nowrap ${
                    state.approvedRequirementIds.has(req.id)
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-300 hover:bg-gray-400'
                  } disabled:opacity-50`}
                >
                  {approving === req.id ? '...' : state.approvedRequirementIds.has(req.id) ? '✓ OK' : 'Approve'}
                </button>
              </div>
            ))}
          </div>

          {allApproved && <div className="text-xs text-green-600 font-semibold">✓ Ready to generate test cases</div>}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#9333ea' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#9333ea' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ GENERATE NODE ============
export const GenerateNodeComponent = ({ data, isConnectable }) => {
  const { generateTestCases, isLoading, error, clearError } = useWorkflowApi();
  const { state, setTestCases, setGenerationError } = useWorkflow();
  const [showDetails, setShowDetails] = useState(false);

  const handleGenerate = async () => {
    clearError();
    if (!state.docId) {
      setGenerationError('No document');
      return;
    }
    if (state.approvedRequirementIds.size === 0) {
      setGenerationError('No approved requirements');
      return;
    }

    const testCases = await generateTestCases(state.docId, ['positive', 'negative', 'boundary']);
    if (testCases) {
      setTestCases(testCases);
      if (data.onProcessed) data.onProcessed({ test_case_count: testCases.length });
    } else {
      setGenerationError('Generation failed');
    }
  };

  return (
    <div className={`bg-green-50 border-2 border-green-300 rounded-lg p-4 min-w-[320px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-green-900 mb-2">🤖 {data.name || 'Generate Test Cases'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      {!state.testCases.length ? (
        <button
          onClick={handleGenerate}
          disabled={isLoading || state.approvedRequirementIds.size === 0}
          className="w-full text-xs bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors"
        >
          {isLoading ? 'Generating...' : 'Generate Test Cases'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="text-xs bg-green-100 p-2 rounded">
            ✓ {state.testCases.length} test cases generated
          </div>
          <div className="text-xs text-gray-700">
            Types: {new Set(state.testCases.map((tc) => tc.test_type)).size} types
          </div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>

          {showDetails && (
            <div className="max-h-40 overflow-y-auto bg-white border rounded p-2 text-xs space-y-1">
              {state.testCases.slice(0, 5).map((tc) => (
                <div key={tc.id} className="border-b pb-1">
                  <div className="font-semibold text-gray-700">{tc.test_case_id}</div>
                  <div className="text-gray-500 truncate">{tc.gherkin?.substring(0, 50)}...</div>
                </div>
              ))}
              {state.testCases.length > 5 && <div className="text-gray-500">+{state.testCases.length - 5} more...</div>}
            </div>
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2">⚠️ {error}</div>}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#10b981' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#10b981' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ JUDGE NODE ============
export const JudgeNodeComponent = ({ data, isConnectable }) => {
  const { judgeTestCases, isLoading, error, clearError } = useWorkflowApi();
  const { state, setJudgeVerdicts, setJudgeError } = useWorkflow();
  const [showDetails, setShowDetails] = useState(false);

  const handleJudge = async () => {
    clearError();
    if (state.testCases.length === 0) {
      setJudgeError('No test cases to judge');
      return;
    }

    const verdicts = await judgeTestCases(state.testCases.map((tc) => tc.id));
    if (verdicts) {
      setJudgeVerdicts(verdicts);
      const avgScore = (verdicts.reduce((sum, v) => sum + v.total_rating, 0) / verdicts.length).toFixed(1);
      if (data.onProcessed) data.onProcessed({ avg_score: avgScore, verdict_count: verdicts.length });
    } else {
      setJudgeError('Judge evaluation failed');
    }
  };

  const avgScore =
    state.judgeVerdicts.length > 0
      ? (state.judgeVerdicts.reduce((sum, v) => sum + v.total_rating, 0) / state.judgeVerdicts.length).toFixed(1)
      : 0;

  return (
    <div className={`bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 min-w-[320px] shadow-lg border-dashed ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-yellow-900 mb-2">⚖️ {data.name || 'Judge Quality'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label || 'Optional quality evaluation'}</div>

      {!state.judgeVerdicts.length ? (
        <button
          onClick={handleJudge}
          disabled={isLoading || state.testCases.length === 0}
          className="w-full text-xs bg-yellow-500 text-white p-2 rounded hover:bg-yellow-600 disabled:bg-gray-400 transition-colors"
        >
          {isLoading ? 'Evaluating...' : 'Evaluate Quality'}
        </button>
      ) : (
        <div className="space-y-2">
          <div className="text-xs bg-yellow-100 p-2 rounded">
            ✓ Average Score: <span className="font-semibold">{avgScore}/4</span>
          </div>
          <div className="text-xs text-gray-700">{state.judgeVerdicts.length} verdicts generated</div>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showDetails ? 'Hide' : 'Show'} Details
          </button>

          {showDetails && (
            <div className="max-h-40 overflow-y-auto bg-white border rounded p-2 text-xs space-y-1">
              {state.judgeVerdicts.slice(0, 5).map((v) => (
                <div key={v.test_case_id} className="border-b pb-1">
                  <div className="font-semibold text-gray-700">TC #{v.test_case_id}</div>
                  <div className="text-gray-500">Rating: {v.total_rating}/4</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2">⚠️ {error}</div>}

      <div className="text-xs text-orange-600 font-semibold mt-2">Optional</div>

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#eab308' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#eab308' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ APPROVE NODE ============
export const ApproveNodeComponent = ({ data, isConnectable }) => {
  const { state, selectTestCase, deselectTestCase } = useWorkflow();

  const handleToggle = (testCaseId: number) => {
    if (state.selectedTestCaseIds.has(testCaseId)) {
      deselectTestCase(testCaseId);
    } else {
      selectTestCase(testCaseId);
    }
  };

  const selectedCount = state.selectedTestCaseIds.size;
  const totalCount = state.testCases.length;

  return (
    <div className={`bg-purple-50 border-2 border-purple-300 rounded-lg p-4 min-w-[320px] shadow-lg`}>
      <div className="font-bold text-purple-900 mb-2">✅ {data.name || 'Approve Test Cases'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label || 'Select cases to push'}</div>

      {state.testCases.length === 0 ? (
        <div className="text-xs text-gray-500">No test cases to approve</div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs bg-purple-100 p-2 rounded">
            {selectedCount}/{totalCount} selected
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {state.testCases.map((tc) => (
              <div
                key={tc.id}
                className={`text-xs p-2 rounded border flex items-center gap-2 ${
                  state.selectedTestCaseIds.has(tc.id) ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200'
                }`}
              >
                <input
                  type="checkbox"
                  checked={state.selectedTestCaseIds.has(tc.id)}
                  onChange={() => handleToggle(tc.id)}
                  className="w-3 h-3"
                />
                <div className="flex-1 truncate">
                  <div className="font-semibold truncate">{tc.test_case_id}</div>
                  <div className="text-gray-500 text-xs">{tc.test_type}</div>
                </div>
              </div>
            ))}
          </div>

          {selectedCount > 0 && (
            <div className="text-xs text-green-600 font-semibold">✓ Ready to push {selectedCount} cases</div>
          )}
        </div>
      )}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#9333ea' }}
        isConnectable={isConnectable}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: '#9333ea' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};

// ============ JIRA PUSH NODE ============
export const JiraPushNodeComponent = ({ data, isConnectable }) => {
  const { pushToJira, isLoading, error, clearError } = useWorkflowApi();
  const { state, setJiraResult, setJiraError } = useWorkflow();
  const [jiraConfig, setJiraConfig] = useState({
    url: 'https://jira.example.com',
    project_key: 'TEST',
    api_token: '',
    username: '',
  });
  const [showConfig, setShowConfig] = useState(false);

  const handlePush = async () => {
    clearError();
    if (state.selectedTestCaseIds.size === 0) {
      setJiraError('No test cases selected');
      return;
    }
    if (!jiraConfig.api_token || !jiraConfig.username) {
      setJiraError('JIRA credentials required');
      return;
    }

    const selectedIds = Array.from(state.selectedTestCaseIds);
    const result = await pushToJira(jiraConfig, selectedIds);
    if (result) {
      setJiraResult({ created_issues_count: result.created_issues_count, issue_keys: result.issue_keys });
      if (data.onProcessed) data.onProcessed({ pushed_count: result.created_issues_count });
    } else {
      setJiraError('Push failed');
    }
  };

  return (
    <div className={`bg-red-50 border-2 border-red-300 rounded-lg p-4 min-w-[340px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-red-900 mb-2">🔌 {data.name || 'Push to JIRA'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      {!state.jiraResult ? (
        <div className="space-y-2">
          {!showConfig ? (
            <button
              onClick={() => setShowConfig(true)}
              className="text-xs text-blue-600 hover:underline mb-2"
            >
              Show JIRA Configuration
            </button>
          ) : (
            <>
              <input
                type="text"
                placeholder="JIRA URL"
                value={jiraConfig.url}
                onChange={(e) => setJiraConfig({ ...jiraConfig, url: e.target.value })}
                className="w-full text-xs p-1 border rounded"
              />
              <input
                type="text"
                placeholder="Project Key"
                value={jiraConfig.project_key}
                onChange={(e) => setJiraConfig({ ...jiraConfig, project_key: e.target.value })}
                className="w-full text-xs p-1 border rounded"
              />
              <input
                type="text"
                placeholder="Username"
                value={jiraConfig.username}
                onChange={(e) => setJiraConfig({ ...jiraConfig, username: e.target.value })}
                className="w-full text-xs p-1 border rounded"
              />
              <input
                type="password"
                placeholder="API Token"
                value={jiraConfig.api_token}
                onChange={(e) => setJiraConfig({ ...jiraConfig, api_token: e.target.value })}
                className="w-full text-xs p-1 border rounded"
              />
            </>
          )}

          <div className="text-xs bg-red-100 p-2 rounded">
            Ready to push: {state.selectedTestCaseIds.size} test cases
          </div>

          <button
            onClick={handlePush}
            disabled={isLoading || state.selectedTestCaseIds.size === 0 || !jiraConfig.api_token}
            className="w-full text-xs bg-red-500 text-white p-2 rounded hover:bg-red-600 disabled:bg-gray-400 transition-colors"
          >
            {isLoading ? 'Pushing...' : 'Push to JIRA'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs bg-green-100 p-2 rounded">
            ✓ Pushed {state.jiraResult.created_issues_count} issues
          </div>
          <div className="max-h-32 overflow-y-auto bg-white border rounded p-2 text-xs space-y-1">
            {state.jiraResult.issue_keys.map((key) => (
              <div key={key} className="text-gray-700 font-semibold">
                {key}
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2">⚠️ {error}</div>}

      <Handle
        type="target"
        position={Position.Left}
        style={{ background: '#ef4444' }}
        isConnectable={isConnectable}
      />
    </div>
  );
};
