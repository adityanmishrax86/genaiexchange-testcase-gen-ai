/**
 * useMockApi.ts - Mock API Hook
 *
 * Provides a way to globally enable/disable mock API responses.
 * When enabled, all API calls are intercepted and mocked.
 *
 * Usage:
 * 1. Set VITE_USE_MOCK_API=true in .env
 * 2. Import useMockApi in your component
 * 3. const { isMockEnabled, toggleMock } = useMockApi()
 *
 * Mocked endpoints:
 * - POST /api/upload - File upload with FormData
 * - POST /api/batch/create-batch - Batch creation with JSON
 * - GET /api/batch/{batch_id}/status - Batch polling with JSON
 * - POST /api/embeddings/process-batch - Embeddings with JSON
 * - POST /api/results/aggregate - Results with JSON
 * - POST /api/langfuse/create-evaluation-run - Evaluation with JSON
 */

import { useState, useEffect } from 'react';
import { mockApiCall } from '../services/mockApiService';

const MOCK_API_KEY = 'mockApiEnabled';

/**
 * Hook to manage mock API state
 */
export function useMockApi() {
  const [isMockEnabled, setIsMockEnabled] = useState(() => {
    // Check environment variable or localStorage
    const envEnabled = import.meta.env.VITE_USE_MOCK_API === 'true';
    const savedState = localStorage.getItem(MOCK_API_KEY);
    return savedState !== null ? savedState === 'true' : envEnabled;
  });

  useEffect(() => {
    localStorage.setItem(MOCK_API_KEY, String(isMockEnabled));
  }, [isMockEnabled]);

  const toggleMock = () => {
    setIsMockEnabled((prev) => !prev);
  };

  return {
    isMockEnabled,
    toggleMock,
  };
}

/**
 * Fetch wrapper that uses mock API when enabled
 */
export async function fetchWithMock(
  endpoint: string,
  options?: RequestInit
): Promise<Response> {
  const isMockEnabled = localStorage.getItem(MOCK_API_KEY) === 'true';

  if (!isMockEnabled) {
    return fetch(endpoint, options);
  }

  try {
    // Call mock API
    const method = options?.method || 'GET';
    let body: Record<string, any> | undefined;
    let file: File | undefined;

    if (options?.body) {
      if (typeof options.body === 'string') {
        body = JSON.parse(options.body);
      } else if (options.body instanceof FormData) {
        // Extract file from FormData for upload endpoint
        if (endpoint.includes('/api/upload')) {
          file = options.body.get('file') as File;
          if (!file) {
            throw new Error('No file found in FormData');
          }
        } else {
          // For non-upload FormData, fall back to real API
          return fetch(endpoint, options);
        }
      }
    }

    const mockData = await mockApiCall(endpoint, method, body, file);

    // Return a Response object that mimics fetch
    return new Response(JSON.stringify(mockData), {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Mock API failed, falling back to real API:', error);
    return fetch(endpoint, options);
  }
}
