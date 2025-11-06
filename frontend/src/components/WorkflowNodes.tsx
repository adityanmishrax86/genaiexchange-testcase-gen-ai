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

// ============ JSON RESPONSE VIEWER ============
const ResponseViewer = ({ data, title }: { data: any; title: string }) => {
  const [expanded, setExpanded] = useState(false);
  return (
    <details className="cursor-pointer mt-2">
      <summary className="font-semibold text-blue-700 hover:text-blue-900">
        {expanded ? '▼' : '▶'} {title} (Full Response)
      </summary>
      <div className="mt-2 ml-2 bg-gray-900 text-gray-100 p-3 rounded text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto">
        <pre>{JSON.stringify(data, null, 2)}</pre>
      </div>
    </details>
  );
};

// ============ UPLOAD NODE ============
export const UploadNodeComponent = ({ data, isConnectable }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadFile, isLoading, error, clearError } = useWorkflowApi();
  const { state, setDocId, setExtractionError } = useWorkflow();
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    clearError();
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      clearError();
      setExtractionError('File size exceeds 50MB limit');
      return;
    }

    const result = await uploadFile(file);
    if (result) {
      setDocId(result.doc_id, result.filename);
      setExtractionError(null);
      setUploadProgress(100);
      if (data.onProcessed) data.onProcessed({ doc_id: result.doc_id, filename: result.filename });

      // Reset progress after a short delay
      setTimeout(() => setUploadProgress(0), 1000);
    }
  };

  const getFileSize = (_filename: string): string => {
    // This is a placeholder - actual file size would come from backend
    return 'File ready for processing';
  };

  const hasFile = state.docId !== null && state.filename !== null;

  return (
    <div className={`bg-blue-50 border-2 ${hasFile ? 'border-green-400' : 'border-blue-300'} rounded-lg p-4 min-w-[300px] shadow-lg transition-all ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-blue-900 mb-2">📤 {data.name || 'Upload Requirements'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.docx,.csv,.xlsx,.txt"
        onChange={handleFileSelect}
        className="hidden"
      />

      {!hasFile ? (
        <>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full text-xs bg-blue-500 text-white p-2 rounded hover:bg-blue-600 disabled:bg-gray-400 transition-colors font-semibold"
          >
            {isLoading ? `Uploading... ${uploadProgress}%` : '📁 Choose File to Upload'}
          </button>
          <div className="text-xs text-gray-500 mt-2 text-center">
            Supports: PDF, DOCX, CSV, XLSX, TXT (Max 50MB)
          </div>
        </>
      ) : (
        <div className="space-y-2">
          <div className="bg-green-100 border border-green-400 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">✓</span>
              <span className="font-semibold text-green-900">File Uploaded Successfully</span>
            </div>
            <div className="text-xs text-green-800 ml-6 truncate" title={state.filename || ''}>
              {state.filename}
            </div>
            <div className="text-xs text-green-700 ml-6 mt-1">
              {getFileSize(state.filename || '')}
            </div>
          </div>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading}
            className="w-full text-xs bg-gray-400 text-white p-2 rounded hover:bg-gray-500 disabled:bg-gray-300 transition-colors"
          >
            {isLoading ? 'Uploading...' : 'Change File'}
          </button>
        </div>
      )}

      {error && (
        <div className="text-xs text-red-600 mt-2 p-2 bg-red-50 rounded border border-red-200">
          ⚠️ {error}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        style={{ background: hasFile ? '#22c55e' : '#3b82f6' }}
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
  const [extractionResponse, setExtractionResponse] = useState<any>(null);

  const handleExtract = async () => {
    clearError();
    if (!state.docId) {
      setExtractionError('No document uploaded');
      return;
    }

    const requirements = await extractRequirements(state.docId);
    if (requirements) {
      setRequirements(requirements);
      // Store full response for display
      setExtractionResponse({
        created_requirements: requirements,
        count: requirements.length,
        timestamp: new Date().toISOString(),
      });
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
          <div className="flex gap-2">
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="text-xs text-blue-600 hover:underline"
            >
              {showDetails ? 'Hide' : 'Show'} Details
            </button>
          </div>

          {extractionResponse && <ResponseViewer data={extractionResponse} title="Extraction Response" />}

          {showDetails && (
            <div className="max-h-96 overflow-y-auto bg-white border rounded p-3 text-xs space-y-3">
              {state.requirements.map((req, idx) => (
                <div key={req.id} className="border border-green-200 rounded p-2 bg-green-50">
                  <div className="font-semibold text-green-900 mb-2">Requirement #{idx + 1} (ID: {req.id})</div>
                  <div className="bg-white p-2 rounded mb-2 text-gray-700 whitespace-pre-wrap break-words">
                    {req.raw_text}
                  </div>
                  <div className="space-y-1 text-gray-600">
                    <div><span className="font-semibold">Overall Confidence:</span> {(req.overall_confidence * 100).toFixed(0)}%</div>
                    {req.structured && Object.keys(req.structured).length > 0 && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-green-700">Structured Data</summary>
                        <div className="mt-2 ml-2 bg-gray-100 p-2 rounded text-xs font-mono whitespace-pre-wrap break-words">
                          {JSON.stringify(req.structured, null, 2).substring(0, 300)}...
                        </div>
                      </details>
                    )}
                    {req.field_confidences && Object.keys(req.field_confidences).length > 0 && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-green-700">Field Confidences</summary>
                        <div className="mt-2 ml-2 space-y-1">
                          {Object.entries(req.field_confidences).map(([field, conf]) => (
                            <div key={field} className="flex justify-between text-xs">
                              <span>{field}:</span>
                              <span className="font-mono">{((conf as number) * 100).toFixed(0)}%</span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
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
  const [showReviewResponse, setShowReviewResponse] = useState(false);

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

          <button
            onClick={() => setShowReviewResponse(!showReviewResponse)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showReviewResponse ? 'Hide' : 'Show'} Approved Summary
          </button>

          {showReviewResponse && (
            <ResponseViewer
              data={{
                approved_count: approvedCount,
                total_count: totalCount,
                approved_requirement_ids: Array.from(state.approvedRequirementIds),
                timestamp: new Date().toISOString(),
              }}
              title="Review Summary"
            />
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {state.requirements.map((req) => (
              <div
                key={req.id}
                className={`text-xs p-2 rounded border flex justify-between items-center ${state.approvedRequirementIds.has(req.id) ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200'
                  }`}
              >
                <div className="flex-1 truncate">
                  <div className="font-semibold truncate">{req.raw_text.substring(0, 40)}...</div>
                  <div className="text-gray-500">ID: {req.id}</div>
                </div>
                <button
                  onClick={() => handleApproveReq(req.id)}
                  disabled={approving === req.id || state.approvedRequirementIds.has(req.id)}
                  className={`ml-2 px-2 py-1 rounded text-xs whitespace-nowrap ${state.approvedRequirementIds.has(req.id)
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
  const [generationResponse, setGenerationResponse] = useState<any>(null);

  const handleGenerate = async () => {
    clearError();
    if (!state.docId) {
      setGenerationError('❌ No document uploaded. Go to Upload Requirements node first.');
      return;
    }
    if (state.requirements.length === 0) {
      setGenerationError('❌ No requirements extracted. Run Extract Requirements first.');
      return;
    }
    if (state.approvedRequirementIds.size === 0) {
      setGenerationError('❌ No requirements approved. Approve requirements in Review Requirements node first.');
      return;
    }

    const testCases = await generateTestCases(state.docId, ['positive', 'negative', 'boundary']);
    if (testCases && testCases.length > 0) {
      setTestCases(testCases);
      // Store full response for display
      setGenerationResponse({
        test_cases: testCases,
        count: testCases.length,
        types: [...new Set(testCases.map(tc => tc.test_type))],
        timestamp: new Date().toISOString(),
      });
      if (data.onProcessed) data.onProcessed({ test_case_count: testCases.length });
    } else if (testCases && testCases.length === 0) {
      setGenerationError('⚠️ No test cases generated. Backend may not have created any cases. Check backend logs.');
    } else {
      setGenerationError('❌ Generation failed. Check browser console and backend logs for details.');
    }
  };

  return (
    <div className={`bg-green-50 border-2 border-green-300 rounded-lg p-4 min-w-[320px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-green-900 mb-2">🤖 {data.name || 'Generate Test Cases'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label}</div>

      {!state.testCases.length ? (
        <>
          <button
            onClick={handleGenerate}
            disabled={isLoading || state.approvedRequirementIds.size === 0}
            className="w-full text-xs bg-green-500 text-white p-2 rounded hover:bg-green-600 disabled:bg-gray-400 transition-colors"
            title={state.approvedRequirementIds.size === 0 ? 'Approve requirements in Review node first' : ''}
          >
            {isLoading ? 'Generating...' : 'Generate Test Cases'}
          </button>
          {state.approvedRequirementIds.size === 0 && (
            <div className="text-xs text-orange-600 mt-2 p-2 bg-orange-50 rounded border border-orange-200">
              ⚠️ <strong>Action Required:</strong> Approve requirements in the Review Requirements node first
            </div>
          )}
        </>
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

          {generationResponse && <ResponseViewer data={generationResponse} title="Generation Response" />}

          {showDetails && (
            <div className="max-h-96 overflow-y-auto bg-white border rounded p-3 text-xs space-y-3">
              {state.testCases.map((tc, idx) => (
                <div key={tc.id} className="border border-green-200 rounded p-2 bg-green-50">
                  <div className="font-semibold text-green-900 mb-2">Test Case #{idx + 1} - {tc.test_case_id}</div>
                  <div className="space-y-2 text-gray-700">
                    <div>
                      <span className="font-semibold">Type:</span> <span className="bg-blue-100 px-2 py-1 rounded text-xs">{tc.test_type}</span>
                    </div>

                    <details className="cursor-pointer">
                      <summary className="font-semibold text-green-700">Gherkin Scenario</summary>
                      <div className="mt-2 ml-2 bg-gray-100 p-2 rounded whitespace-pre-wrap break-words font-mono text-xs">
                        {tc.gherkin || 'N/A'}
                      </div>
                    </details>

                    {tc.evidence_json && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-green-700">Evidence</summary>
                        <div className="mt-2 ml-2 bg-gray-100 p-2 rounded whitespace-pre-wrap break-words font-mono text-xs">
                          {tc.evidence_json}
                        </div>
                      </details>
                    )}

                    {tc.automated_steps_json && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-green-700">Automated Steps</summary>
                        <div className="mt-2 ml-2 bg-gray-100 p-2 rounded whitespace-pre-wrap break-words font-mono text-xs">
                          {tc.automated_steps_json}
                        </div>
                      </details>
                    )}

                    {tc.sample_data_json && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-green-700">Sample Data</summary>
                        <div className="mt-2 ml-2 bg-gray-100 p-2 rounded whitespace-pre-wrap break-words font-mono text-xs">
                          {tc.sample_data_json}
                        </div>
                      </details>
                    )}

                    {tc.code_scaffold_str && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-green-700">Code Scaffold</summary>
                        <div className="mt-2 ml-2 bg-gray-100 p-2 rounded whitespace-pre-wrap break-words font-mono text-xs">
                          {tc.code_scaffold_str}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
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
  const [judgeResponse, setJudgeResponse] = useState<any>(null);

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
      // Store full response for display
      setJudgeResponse({
        verdicts: verdicts,
        count: verdicts.length,
        average_score: avgScore,
        timestamp: new Date().toISOString(),
      });
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
    <div className={`bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4 min-w-[320px] shadow-lg ${isLoading ? 'animate-pulse' : ''}`}>
      <div className="font-bold text-yellow-900 mb-2">⚖️ {data.name || 'Judge Quality'}</div>
      <div className="text-xs text-gray-600 mb-3">{data.label || 'AI-powered quality evaluation'}</div>

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

          {judgeResponse && <ResponseViewer data={judgeResponse} title="Judge Response" />}

          {showDetails && (
            <div className="max-h-96 overflow-y-auto bg-white border rounded p-3 text-xs space-y-3">
              {state.judgeVerdicts.map((v, idx) => (
                <div key={v.test_case_id} className="border border-yellow-200 rounded p-2 bg-yellow-50">
                  <div className="font-semibold text-yellow-900 mb-2">Verdict #{idx + 1} - Test Case #{v.test_case_id}</div>
                  <div className="space-y-2 text-gray-700">
                    <div className="flex items-center justify-between bg-yellow-100 p-2 rounded">
                      <span className="font-semibold">Overall Rating:</span>
                      <span className="text-lg font-bold text-yellow-700">{v.total_rating}/4</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {v.correctness_of_trigger !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Correctness of Trigger</div>
                          <div className="text-lg font-bold text-gray-900">{v.correctness_of_trigger}/4</div>
                        </div>
                      )}
                      {v.timing_and_latency !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Timing & Latency</div>
                          <div className="text-lg font-bold text-gray-900">{v.timing_and_latency}/4</div>
                        </div>
                      )}
                      {v.actions_and_priority !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Actions & Priority</div>
                          <div className="text-lg font-bold text-gray-900">{v.actions_and_priority}/4</div>
                        </div>
                      )}
                      {v.logging_and_traceability !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Logging & Traceability</div>
                          <div className="text-lg font-bold text-gray-900">{v.logging_and_traceability}/4</div>
                        </div>
                      )}
                      {v.standards_citations !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Standards Citations</div>
                          <div className="text-lg font-bold text-gray-900">{v.standards_citations}/4</div>
                        </div>
                      )}
                      {v.boundary_readiness !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Boundary Readiness</div>
                          <div className="text-lg font-bold text-gray-900">{v.boundary_readiness}/4</div>
                        </div>
                      )}
                      {v.consistency_and_no_hallucination !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Consistency & Hallucination</div>
                          <div className="text-lg font-bold text-gray-900">{v.consistency_and_no_hallucination}/4</div>
                        </div>
                      )}
                      {v.confidence !== undefined && (
                        <div className="bg-gray-100 p-2 rounded">
                          <div className="font-semibold text-xs text-gray-700">Confidence</div>
                          <div className="text-lg font-bold text-gray-900">{(v.confidence * 100).toFixed(0)}%</div>
                        </div>
                      )}
                    </div>

                    {v.feedback && (
                      <details className="cursor-pointer">
                        <summary className="font-semibold text-yellow-700">Feedback & Evaluation</summary>
                        <div className="mt-2 ml-2 bg-gray-100 p-2 rounded whitespace-pre-wrap break-words">
                          {v.feedback}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <div className="text-xs text-red-600 mt-2">⚠️ {error}</div>}

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
  const [showApproveResponse, setShowApproveResponse] = useState(false);

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

          <button
            onClick={() => setShowApproveResponse(!showApproveResponse)}
            className="text-xs text-blue-600 hover:underline"
          >
            {showApproveResponse ? 'Hide' : 'Show'} Selection Summary
          </button>

          {showApproveResponse && (
            <ResponseViewer
              data={{
                selected_count: selectedCount,
                total_count: totalCount,
                selected_test_case_ids: Array.from(state.selectedTestCaseIds),
                timestamp: new Date().toISOString(),
              }}
              title="Approval Summary"
            />
          )}

          <div className="max-h-48 overflow-y-auto space-y-1">
            {state.testCases.map((tc) => (
              <div
                key={tc.id}
                className={`text-xs p-2 rounded border flex items-center gap-2 ${state.selectedTestCaseIds.has(tc.id) ? 'bg-green-100 border-green-300' : 'bg-white border-gray-200'
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
