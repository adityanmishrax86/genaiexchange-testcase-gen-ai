import React, { useState } from 'react';
import { WorkflowConfig } from '../config/workflowConfig';

interface WorkflowSettingsProps {
  config: WorkflowConfig;
  onConfigChange: (config: WorkflowConfig) => void;
  onClose: () => void;
}

/**
 * Workflow Settings Modal
 * Allows users to toggle optional workflow components:
 * - Standard Document Upload
 * - Judge LLM Evaluation
 */
export default function WorkflowSettings({
  config,
  onConfigChange,
  onClose,
}: WorkflowSettingsProps) {
  const [includeStandards, setIncludeStandards] = useState(config.includeStandards);
  const [includeJudge, setIncludeJudge] = useState(config.includeJudge);

  const handleSave = () => {
    onConfigChange({
      includeStandards,
      includeJudge,
    });
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
            Workflow Settings
          </h2>
          <p className="text-blue-100 text-sm mt-1">Configure optional workflow components</p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Include Standards Option */}
          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="includeStandards"
                checked={includeStandards}
                onChange={(e) => setIncludeStandards(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
              <div className="flex-1">
                <label
                  htmlFor="includeStandards"
                  className="block font-semibold text-gray-800 cursor-pointer hover:text-blue-600"
                >
                  📋 Include Standard Documents
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  Upload compliance standards (IEC-62304, FDA, ISO) to enhance test case generation with standards-based coverage.
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                  Adds: Upload Standards node between Extract and Generate
                </div>
              </div>
            </div>
          </div>

          {/* Include Judge Option */}
          <div className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="includeJudge"
                checked={includeJudge}
                onChange={(e) => setIncludeJudge(e.target.checked)}
                className="mt-1 w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
              <div className="flex-1">
                <label
                  htmlFor="includeJudge"
                  className="block font-semibold text-gray-800 cursor-pointer hover:text-blue-600"
                >
                  🤖 Include Judge LLM Evaluation
                </label>
                <p className="text-xs text-gray-600 mt-1">
                  Enable AI-powered quality evaluation with 8-category rubric scoring (Correctness, Timing, Actions, Logging, Standards, Boundary, Consistency, Confidence).
                </p>
                <div className="mt-2 flex items-center gap-1 text-xs text-gray-500">
                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                  Adds: Judge LLM Evaluation node between Generate and Review
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Preview */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-4">
            <p className="text-xs font-semibold text-gray-700 mb-2">📊 Workflow Preview</p>
            <div className="text-xs text-gray-600 space-y-1 font-mono">
              <div>Upload Requirements</div>
              <div className="ml-2 text-gray-400">↓</div>
              <div>Extract</div>
              {includeStandards && (
                <>
                  <div className="ml-2 text-gray-400">↓</div>
                  <div className="text-blue-600">Upload Standards</div>
                  <div className="ml-2 text-gray-400">↓</div>
                </>
              )}
              {!includeStandards && <div className="ml-2 text-gray-400">↓</div>}
              <div>Generate Tests</div>
              {includeJudge && (
                <>
                  <div className="ml-2 text-gray-400">↓</div>
                  <div className="text-blue-600">Judge LLM Evaluation</div>
                  <div className="ml-2 text-gray-400">↓</div>
                </>
              )}
              {!includeJudge && <div className="ml-2 text-gray-400">↓</div>}
              <div>Human Review</div>
              <div className="ml-2 text-gray-400">↓</div>
              <div>Export to ALM</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 bg-gray-50 border-t rounded-b-lg">
          <button
            onClick={handleSave}
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Save Settings
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 font-medium rounded-lg hover:bg-gray-300 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
