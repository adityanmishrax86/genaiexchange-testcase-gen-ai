/**
 * useWorkflowApi.ts
 *
 * API helper hook for workflow operations.
 * Centralizes all backend API calls with error handling and type safety.
 */

import { useState, useCallback } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';

// ============ TYPE DEFINITIONS ============

export interface UploadResult {
  doc_id: number;
  filename: string;
  upload_session_id: string;
}

export interface ExtractedRequirement {
  id: number;
  requirement_id?: string;
  raw_text: string;
  structured: Record<string, any>;
  field_confidences: Record<string, number>;
  overall_confidence: number;
  status: string;
}

export interface ExtractResult {
  created_requirements: ExtractedRequirement[];
}

export interface GeneratedTestCase {
  id: number;
  test_case_id: string;
  requirement_id: number;
  gherkin: string;
  evidence_json: string;
  automated_steps_json: string;
  sample_data_json: string;
  code_scaffold_str: string;
  test_type: string;
  status: string;
}

export interface GenerateResult {
  test_cases: GeneratedTestCase[];
}

export interface JudgeVerdict {
  test_case_id: number;
  feedback: string;
  evaluation: string;
  total_rating: number;
  correctness_of_trigger?: number;
  timing_and_latency?: number;
  actions_and_priority?: number;
  logging_and_traceability?: number;
  standards_citations?: number;
  boundary_readiness?: number;
  consistency_and_no_hallucination?: number;
  confidence?: number;
}

export interface JudgeResult {
  verdicts: JudgeVerdict[];
}

export interface JiraConfig {
  url: string;
  project_key: string;
  api_token: string;
  username: string;
}

export interface JiraExportResult {
  message: string;
  created_issues_count: number;
  issue_keys: string[];
}

// ============ API HELPER HOOK ============

export function useWorkflowApi() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  // Upload file to backend
  const uploadFile = useCallback(async (file: File): Promise<UploadResult | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} ${errorText}`);
      }

      const data: UploadResult = await response.json();
      return data;
    } catch (err: any) {
      const errorMsg = err.message || 'Upload failed';
      setError(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Extract requirements from document
  const extractRequirements = useCallback(async (docId: number): Promise<ExtractedRequirement[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/extract/${docId}`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Extraction failed: ${response.status} ${errorText}`);
      }

      const data: ExtractResult = await response.json();
      return data.created_requirements;
    } catch (err: any) {
      const errorMsg = err.message || 'Extraction failed';
      setError(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Approve a requirement
  const approveRequirement = useCallback(async (reqId: number): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/review/${reqId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewer: 'frontend-user',
          review_confidence: 1.0,
          note: 'Approved via frontend',
          edits: {},
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Approval failed: ${response.status} ${errorText}`);
      }

      return true;
    } catch (err: any) {
      const errorMsg = err.message || 'Approval failed';
      setError(errorMsg);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Generate test cases for a document
  const generateTestCases = useCallback(
    async (docId: number, testTypes: string[]): Promise<GeneratedTestCase[] | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/generate/preview`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            doc_id: docId,
            test_types: testTypes,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Generation failed: ${response.status} ${errorText}`);
        }

        const data: GenerateResult = await response.json();
        return data.test_cases || [];
      } catch (err: any) {
        const errorMsg = err.message || 'Generation failed';
        setError(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Judge batch of test cases
  const judgeTestCases = useCallback(async (testCaseIds: number[]): Promise<JudgeVerdict[] | null> => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/judge/evaluate-batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_case_ids: testCaseIds,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Judge evaluation failed: ${response.status} ${errorText}`);
      }

      const data: JudgeResult = await response.json();
      return data.verdicts || [];
    } catch (err: any) {
      const errorMsg = err.message || 'Judge evaluation failed';
      setError(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Push test cases to JIRA
  const pushToJira = useCallback(
    async (jiraConfig: JiraConfig, testCaseIds: number[]): Promise<JiraExportResult | null> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`${API_BASE}/export/jira`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jira_config: jiraConfig,
            test_case_ids: testCaseIds,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`JIRA push failed: ${response.status} ${errorText}`);
        }

        const data: JiraExportResult = await response.json();
        return data;
      } catch (err: any) {
        const errorMsg = err.message || 'JIRA push failed';
        setError(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  return {
    isLoading,
    error,
    clearError,
    uploadFile,
    extractRequirements,
    approveRequirement,
    generateTestCases,
    judgeTestCases,
    pushToJira,
  };
}
