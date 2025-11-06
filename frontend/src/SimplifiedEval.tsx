/**
 * SimplifiedEval.tsx - Simplified One-Click Evaluation Flow
 *
 * Two-tab structure:
 * 1. Upload Tab: Upload QnA dataset → Run evaluation
 * 2. Results Tab: View evaluation results with metrics and detailed logs
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

// Dummy evaluation results data
const DUMMY_RESULTS = {
  evaluationId: 'eval_12345',
  timestamp: new Date().toISOString(),
  dataset: {
    name: 'medical_qa_v1.csv',
    totalRows: 150,
    processedRows: 150,
  },
  metrics: {
    averageScore: 0.87,
    accuracy: 0.92,
    precision: 0.89,
    recall: 0.85,
    f1Score: 0.87,
  },
  modelInfo: {
    provider: 'OpenAI',
    model: 'gpt-4-turbo',
    temperature: 0.7,
  },
  logs: [
    {
      id: 1,
      question: 'What is the primary function of the mitochondria?',
      expected: 'Energy production through ATP synthesis',
      actual: 'The mitochondria is responsible for ATP synthesis and cellular energy production',
      score: 0.95,
      status: 'pass',
      timestamp: '2025-11-06T10:23:45Z',
    },
    {
      id: 2,
      question: 'Describe the process of protein synthesis.',
      expected: 'Transcription of DNA to mRNA, then translation to protein',
      actual: 'Protein synthesis involves transcription followed by translation at the ribosome',
      score: 0.92,
      status: 'pass',
      timestamp: '2025-11-06T10:23:46Z',
    },
    {
      id: 3,
      question: 'What are the main components of the cell membrane?',
      expected: 'Phospholipid bilayer with embedded proteins',
      actual: 'The cell membrane consists of a phospholipid bilayer',
      score: 0.78,
      status: 'pass',
      timestamp: '2025-11-06T10:23:47Z',
    },
    {
      id: 4,
      question: 'Explain the role of DNA polymerase.',
      expected: 'Synthesizes new DNA strands during replication',
      actual: 'DNA polymerase helps in replication',
      score: 0.65,
      status: 'warning',
      timestamp: '2025-11-06T10:23:48Z',
    },
    {
      id: 5,
      question: 'What is osmosis?',
      expected: 'Movement of water across a semi-permeable membrane',
      actual: 'Movement of molecules across membranes',
      score: 0.55,
      status: 'fail',
      timestamp: '2025-11-06T10:23:49Z',
    },
  ],
};

type Tab = 'upload' | 'results';

export default function SimplifiedEval() {
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResults, setEvaluationResults] = useState(DUMMY_RESULTS);
  const [progress, setProgress] = useState(0);
  const navigate = useNavigate();

  // Simulate evaluation progress
  useEffect(() => {
    if (isEvaluating) {
      const interval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 100) {
            clearInterval(interval);
            setIsEvaluating(false);
            setActiveTab('results');
            return 100;
          }
          return prev + 10;
        });
      }, 300);
      return () => clearInterval(interval);
    }
  }, [isEvaluating]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const handleRunEvaluation = () => {
    if (!uploadedFile) {
      alert('Please upload a dataset first');
      return;
    }
    setProgress(0);
    setIsEvaluating(true);
  };

  const handleBackToWorkflow = () => {
    navigate('/eval/');
  };

  return (
    <div className="w-full h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-lg p-4">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold">Simplified Evaluation Pipeline</h1>
            <p className="text-sm text-purple-100">One-click QnA dataset evaluation</p>
          </div>
          <button
            onClick={handleBackToWorkflow}
            className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            ← Back to Workflow
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto flex">
          <button
            onClick={() => setActiveTab('upload')}
            className={`px-6 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'upload'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            1. Upload & Run
          </button>
          <button
            onClick={() => setActiveTab('results')}
            className={`px-6 py-3 font-medium border-b-2 transition-colors ${
              activeTab === 'results'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            2. Results
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {activeTab === 'upload' ? (
            <UploadTab
              uploadedFile={uploadedFile}
              isEvaluating={isEvaluating}
              progress={progress}
              onFileUpload={handleFileUpload}
              onRunEvaluation={handleRunEvaluation}
            />
          ) : (
            <ResultsTab results={evaluationResults} />
          )}
        </div>
      </div>
    </div>
  );
}

// ============ UPLOAD TAB COMPONENT ============
interface UploadTabProps {
  uploadedFile: File | null;
  isEvaluating: boolean;
  progress: number;
  onFileUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRunEvaluation: () => void;
}

function UploadTab({
  uploadedFile,
  isEvaluating,
  progress,
  onFileUpload,
  onRunEvaluation,
}: UploadTabProps) {
  return (
    <div className="space-y-6">
      {/* Instructions Card */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-blue-900 mb-2">How it works</h2>
        <ol className="list-decimal list-inside space-y-2 text-blue-800">
          <li>Upload your QnA dataset (CSV format with columns: question, expected_answer)</li>
          <li>Click "Run Evaluation" to start the pipeline</li>
          <li>Wait for processing to complete (automatic redirect to results)</li>
          <li>View detailed results and metrics in the Results tab</li>
        </ol>
      </div>

      {/* Upload Card */}
      <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Upload QnA Dataset</h2>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-purple-400 transition-colors">
          <div className="space-y-4">
            <div className="text-gray-400">
              <svg
                className="mx-auto h-12 w-12"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <div>
              <label
                htmlFor="file-upload"
                className="cursor-pointer bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition-colors inline-block"
              >
                Choose File
              </label>
              <input
                id="file-upload"
                type="file"
                accept=".csv"
                onChange={onFileUpload}
                className="hidden"
              />
            </div>
            {uploadedFile && (
              <div className="text-sm text-gray-600">
                Selected: <span className="font-medium">{uploadedFile.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Run Button */}
        <div className="mt-6">
          <button
            onClick={onRunEvaluation}
            disabled={!uploadedFile || isEvaluating}
            className={`w-full py-4 rounded-lg font-semibold text-lg transition-all ${
              !uploadedFile || isEvaluating
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {isEvaluating ? 'Evaluating...' : 'Run Evaluation'}
          </button>
        </div>

        {/* Progress Bar */}
        {isEvaluating && (
          <div className="mt-6">
            <div className="flex justify-between text-sm text-gray-600 mb-2">
              <span>Processing pipeline...</span>
              <span>{progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-600 to-blue-600 h-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="mt-3 text-sm text-gray-500 text-center">
              {progress < 30 && '📂 Loading dataset...'}
              {progress >= 30 && progress < 60 && '🤖 Running LLM evaluation...'}
              {progress >= 60 && progress < 90 && '📊 Calculating metrics...'}
              {progress >= 90 && '✅ Finalizing results...'}
            </div>
          </div>
        )}
      </div>

      {/* Sample CSV Format */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Expected CSV Format:</h3>
        <pre className="text-xs bg-white p-4 rounded border border-gray-300 overflow-x-auto">
{`question,expected_answer
"What is the capital of France?","Paris"
"Explain photosynthesis","Process by which plants convert light into energy"`}
        </pre>
      </div>
    </div>
  );
}

// ============ RESULTS TAB COMPONENT ============
interface ResultsTabProps {
  results: typeof DUMMY_RESULTS;
}

function ResultsTab({ results }: ResultsTabProps) {
  return (
    <div className="space-y-6">
      {/* Metrics Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MetricCard
          title="Average Score"
          value={(results.metrics.averageScore * 100).toFixed(1) + '%'}
          icon="📊"
          color="blue"
        />
        <MetricCard
          title="Accuracy"
          value={(results.metrics.accuracy * 100).toFixed(1) + '%'}
          icon="🎯"
          color="green"
        />
        <MetricCard
          title="F1 Score"
          value={(results.metrics.f1Score * 100).toFixed(1) + '%'}
          icon="⚡"
          color="purple"
        />
      </div>

      {/* Dataset Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Evaluation Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <InfoItem label="Dataset" value={results.dataset.name} />
          <InfoItem label="Total Rows" value={results.dataset.totalRows.toString()} />
          <InfoItem label="Model" value={results.modelInfo.model} />
          <InfoItem label="Temperature" value={results.modelInfo.temperature.toString()} />
        </div>
      </div>

      {/* Detailed Logs */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-4">Detailed Evaluation Logs</h2>
        <div className="space-y-3">
          {results.logs.map((log) => (
            <LogItem key={log.id} log={log} />
          ))}
        </div>
      </div>

      {/* Export Actions */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Export Results</h3>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            📥 Download CSV
          </button>
          <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            📋 Copy to Clipboard
          </button>
          <button className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors">
            📤 Export to Langfuse
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ HELPER COMPONENTS ============
interface MetricCardProps {
  title: string;
  value: string;
  icon: string;
  color: 'blue' | 'green' | 'purple';
}

function MetricCard({ title, value, icon, color }: MetricCardProps) {
  const colorClasses = {
    blue: 'from-blue-500 to-blue-600',
    green: 'from-green-500 to-green-600',
    purple: 'from-purple-500 to-purple-600',
  };

  return (
    <div className={`bg-gradient-to-r ${colorClasses[color]} text-white rounded-lg p-6 shadow-lg`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-3xl">{icon}</span>
        <span className="text-xs opacity-75">Live</span>
      </div>
      <div className="text-3xl font-bold">{value}</div>
      <div className="text-sm opacity-90 mt-1">{title}</div>
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase font-semibold">{label}</div>
      <div className="text-lg font-medium text-gray-900 mt-1">{value}</div>
    </div>
  );
}

interface LogItemProps {
  log: typeof DUMMY_RESULTS.logs[0];
}

function LogItem({ log }: LogItemProps) {
  const statusColors = {
    pass: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    fail: 'bg-red-100 text-red-800 border-red-200',
  };

  return (
    <div className={`border rounded-lg p-4 ${statusColors[log.status]}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <div className="font-semibold text-sm mb-1">Question #{log.id}</div>
          <div className="text-sm">{log.question}</div>
        </div>
        <div className="ml-4 flex items-center gap-2">
          <span className="text-lg font-bold">{(log.score * 100).toFixed(0)}%</span>
          <span className="text-xl">
            {log.status === 'pass' ? '✅' : log.status === 'warning' ? '⚠️' : '❌'}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-sm">
        <div>
          <div className="font-medium opacity-75">Expected:</div>
          <div className="mt-1">{log.expected}</div>
        </div>
        <div>
          <div className="font-medium opacity-75">Actual:</div>
          <div className="mt-1">{log.actual}</div>
        </div>
      </div>
    </div>
  );
}
