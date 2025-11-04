import React from 'react';
import { WorkflowConfig } from '../config/workflowConfig';

interface WorkflowSettingsProps {
  config: WorkflowConfig;
  onConfigChange: (config: WorkflowConfig) => void;
  onClose: () => void;
}

/**
 * Workflow Settings Modal
 * Displays the fixed workflow configuration (no user-configurable options for MVP)
 * All nodes are mandatory in the current pipeline
 */
export default function WorkflowSettings({
  config,
  onConfigChange,
  onClose,
}: WorkflowSettingsProps) {
  const handleClose = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-2xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-lg">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Workflow Information
          </h2>
          <p className="text-blue-100 text-sm mt-1">Healthcare test generation pipeline</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Fixed Workflow Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-2">✅ Healthcare Test Generation Pipeline</p>
            <p className="text-xs text-blue-800 mb-3">
              All workflow nodes are mandatory for this MVP. The pipeline includes quality assurance and compliance validation.
            </p>
          </div>

          {/* Workflow Structure */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-xs font-semibold text-gray-700 mb-3">📊 Workflow Structure (7 Mandatory Nodes)</p>
            <div className="text-xs text-gray-700 space-y-2 font-mono bg-white p-3 rounded border">
              <div className="flex items-center gap-2">
                <span className="text-blue-600 font-bold">1</span>
                <span>📤 Upload Requirements</span>
              </div>
              <div className="ml-6 text-gray-400">↓</div>
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-bold">2</span>
                <span>🔍 Extract Requirements</span>
              </div>
              <div className="ml-6 text-gray-400">↓</div>
              <div className="flex items-center gap-2">
                <span className="text-purple-600 font-bold">3</span>
                <span>👤 Review Requirements</span>
              </div>
              <div className="ml-6 text-gray-400">↓</div>
              <div className="flex items-center gap-2">
                <span className="text-green-600 font-bold">4</span>
                <span>🤖 Generate Test Cases</span>
              </div>
              <div className="ml-6 text-gray-400">↓</div>
              <div className="flex items-center gap-2">
                <span className="text-yellow-600 font-bold">5</span>
                <span>⚖️ Judge LLM Evaluation</span>
              </div>
              <div className="ml-6 text-gray-400">↓</div>
              <div className="flex items-center gap-2">
                <span className="text-purple-600 font-bold">6</span>
                <span>✅ Approve Test Cases</span>
              </div>
              <div className="ml-6 text-gray-400">↓</div>
              <div className="flex items-center gap-2">
                <span className="text-red-600 font-bold">7</span>
                <span>🔌 Export to ALM</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-900 space-y-1">
              <div><span className="font-semibold">Pipeline Overview:</span></div>
              <div>Users approve which requirements to use before test generation, then approve which test cases to push after quality evaluation.</div>
              <div className="mt-2"><span className="font-semibold">MVP Status:</span> All 7 nodes are mandatory. No user configuration needed.</div>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 bg-gray-50 border-t rounded-b-lg">
          <button
            onClick={handleClose}
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
