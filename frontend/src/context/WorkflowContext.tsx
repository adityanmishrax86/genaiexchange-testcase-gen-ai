/**
 * WorkflowContext.tsx
 *
 * Manages shared workflow state across all nodes.
 * Each node can read and update workflow data.
 */

import React, { createContext, useContext, useState, useCallback } from 'react';
import {
  ExtractedRequirement,
  GeneratedTestCase,
  JudgeVerdict,
} from '../hooks/useWorkflowApi';

export interface WorkflowState {
  // Upload step
  docId: number | null;
  filename: string | null;

  // Extract step
  requirements: ExtractedRequirement[];
  extractionError: string | null;

  // Review step
  approvedRequirementIds: Set<number>;

  // Generate step
  testCases: GeneratedTestCase[];
  generationError: string | null;

  // Judge step
  judgeVerdicts: JudgeVerdict[];
  judgeError: string | null;

  // Approve step
  selectedTestCaseIds: Set<number>;

  // JIRA step
  jiraResult: {
    created_issues_count: number;
    issue_keys: string[];
  } | null;
  jiraError: string | null;
}

export interface WorkflowContextType {
  state: WorkflowState;
  setDocId: (docId: number, filename: string) => void;
  setRequirements: (requirements: ExtractedRequirement[]) => void;
  setExtractionError: (error: string | null) => void;
  approveRequirement: (reqId: number) => void;
  rejectRequirement: (reqId: number) => void;
  setTestCases: (testCases: GeneratedTestCase[]) => void;
  setGenerationError: (error: string | null) => void;
  setJudgeVerdicts: (verdicts: JudgeVerdict[]) => void;
  setJudgeError: (error: string | null) => void;
  selectTestCase: (testCaseId: number) => void;
  deselectTestCase: (testCaseId: number) => void;
  setJiraResult: (result: { created_issues_count: number; issue_keys: string[] } | null) => void;
  setJiraError: (error: string | null) => void;
  reset: () => void;
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

const initialState: WorkflowState = {
  docId: null,
  filename: null,
  requirements: [],
  extractionError: null,
  approvedRequirementIds: new Set(),
  testCases: [],
  generationError: null,
  judgeVerdicts: [],
  judgeError: null,
  selectedTestCaseIds: new Set(),
  jiraResult: null,
  jiraError: null,
};

export function WorkflowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WorkflowState>(initialState);

  const setDocId = useCallback((docId: number, filename: string) => {
    setState((prev) => ({
      ...prev,
      docId,
      filename,
    }));
  }, []);

  const setRequirements = useCallback((requirements: ExtractedRequirement[]) => {
    setState((prev) => ({
      ...prev,
      requirements,
      extractionError: null,
    }));
  }, []);

  const setExtractionError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      extractionError: error,
    }));
  }, []);

  const approveRequirement = useCallback((reqId: number) => {
    setState((prev) => ({
      ...prev,
      approvedRequirementIds: new Set([...prev.approvedRequirementIds, reqId]),
    }));
  }, []);

  const rejectRequirement = useCallback((reqId: number) => {
    setState((prev) => {
      const newSet = new Set(prev.approvedRequirementIds);
      newSet.delete(reqId);
      return {
        ...prev,
        approvedRequirementIds: newSet,
      };
    });
  }, []);

  const setTestCases = useCallback((testCases: GeneratedTestCase[]) => {
    setState((prev) => ({
      ...prev,
      testCases,
      generationError: null,
    }));
  }, []);

  const setGenerationError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      generationError: error,
    }));
  }, []);

  const setJudgeVerdicts = useCallback((verdicts: JudgeVerdict[]) => {
    setState((prev) => ({
      ...prev,
      judgeVerdicts: verdicts,
      judgeError: null,
    }));
  }, []);

  const setJudgeError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      judgeError: error,
    }));
  }, []);

  const selectTestCase = useCallback((testCaseId: number) => {
    setState((prev) => ({
      ...prev,
      selectedTestCaseIds: new Set([...prev.selectedTestCaseIds, testCaseId]),
    }));
  }, []);

  const deselectTestCase = useCallback((testCaseId: number) => {
    setState((prev) => {
      const newSet = new Set(prev.selectedTestCaseIds);
      newSet.delete(testCaseId);
      return {
        ...prev,
        selectedTestCaseIds: newSet,
      };
    });
  }, []);

  const setJiraResult = useCallback(
    (result: { created_issues_count: number; issue_keys: string[] } | null) => {
      setState((prev) => ({
        ...prev,
        jiraResult: result,
        jiraError: null,
      }));
    },
    []
  );

  const setJiraError = useCallback((error: string | null) => {
    setState((prev) => ({
      ...prev,
      jiraError: error,
    }));
  }, []);

  const reset = useCallback(() => {
    setState(initialState);
  }, []);

  const value: WorkflowContextType = {
    state,
    setDocId,
    setRequirements,
    setExtractionError,
    approveRequirement,
    rejectRequirement,
    setTestCases,
    setGenerationError,
    setJudgeVerdicts,
    setJudgeError,
    selectTestCase,
    deselectTestCase,
    setJiraResult,
    setJiraError,
    reset,
  };

  return <WorkflowContext.Provider value={value}>{children}</WorkflowContext.Provider>;
}

export function useWorkflow(): WorkflowContextType {
  const context = useContext(WorkflowContext);
  if (!context) {
    throw new Error('useWorkflow must be used within WorkflowProvider');
  }
  return context;
}
