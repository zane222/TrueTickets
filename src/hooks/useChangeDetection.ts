import { useState, useRef, useEffect, useCallback } from "react";
import apiClient from "../api/apiClient";

interface UseChangeDetectionReturn {
  hasChanged: boolean;
  isPolling: boolean;
  startPolling: (initialData: unknown) => void;
  stopPolling: () => void;
  resetPolling: (newData: unknown) => void;
}

/**
 * Custom hook for change detection polling
 * The backend (Lambda) handles checking if data was modified via If-Modified-Since header.
 * Returns 304 if not modified, or 200 with updated data if modified.
 * Any other status code (404, 500, etc.) is ignored silently.
 * Uses apiClient directly to avoid triggering error alerts for ignored responses.
 * @param endpoint - API endpoint to monitor
 * @param intervalMs - Polling interval in milliseconds (default: 30000)
 * @returns Change detection state and methods
 */
export function useChangeDetection(
  endpoint: string,
  intervalMs: number = 30000,
): UseChangeDetectionReturn {
  const [hasChanged, setHasChanged] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const updatedAtRef = useRef<string | null>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  const startPolling = useCallback(
    (initialData: unknown) => {
      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Extract and store the updated_at timestamp from initial data
      const initialUpdatedAt = (initialData as Record<string, unknown>).updated_at ||
        ((initialData as { ticket?: Record<string, unknown> }).ticket?.updated_at) ||
        ((initialData as { customer?: Record<string, unknown> }).customer?.updated_at) ||
        new Date().toISOString();
      updatedAtRef.current = typeof initialUpdatedAt === 'string' ? initialUpdatedAt : new Date().toISOString();

      setIsPolling(true);
      setHasChanged(false);

      intervalRef.current = setInterval(async () => {
        if (!isMounted.current) return;

        try {
          // Prepare If-Modified-Since header with the timestamp from initial fetch
          const headers: Record<string, string> = {};
          if (updatedAtRef.current) {
            headers["If-Modified-Since"] = updatedAtRef.current;
          }

          const currentData = (await apiClient.get(endpoint, headers)) as Record<
            string,
            unknown
          >;

          if (!isMounted.current) return;

          // If response is empty (304 Not Modified), backend confirms no changes
          if (!currentData || Object.keys(currentData).length === 0) {
            return;
          }

          // If we got data back (200 response), it means the backend detected changes
          // Set hasChanged = true and stop polling
          setHasChanged(true);
          setIsPolling(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        } catch (_error) {
          // Ignore any errors (404, 500, network errors, etc.) and continue polling
          // Only a successful 200 response with data triggers change detection
          return;
        }
      }, intervalMs);
    },
    [endpoint, intervalMs],
  );

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const resetPolling = useCallback(
    (newData: unknown) => {
      stopPolling();

      // Update the stored updated_at timestamp
      const newUpdatedAt = (newData as Record<string, unknown>).updated_at ||
        ((newData as { ticket?: Record<string, unknown> }).ticket?.updated_at) ||
        ((newData as { customer?: Record<string, unknown> }).customer?.updated_at) ||
        updatedAtRef.current;
      updatedAtRef.current = typeof newUpdatedAt === 'string' ? newUpdatedAt : updatedAtRef.current;

      setHasChanged(false);
    },
    [stopPolling],
  );

  // Cleanup on unmount or when endpoint changes
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [endpoint]);

  return {
    hasChanged,
    isPolling,
    startPolling,
    stopPolling,
    resetPolling,
  };
}