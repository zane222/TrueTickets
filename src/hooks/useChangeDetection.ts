import { useState, useRef, useCallback, useEffect } from "react";

interface ApiClient {
  get: (path: string) => Promise<unknown>;
}

interface UseChangeDetectionReturn {
  hasChanged: boolean;
  isPolling: boolean;
  startPolling: (initialData: unknown) => void;
  stopPolling: () => void;
  resetPolling: (newData: unknown) => void;
}

/**
 * Removes pdf_url from data (both top-level and nested in customer)
 * @param data - The data object to filter
 * @returns Filtered data without pdf_url fields
 */
function removePdfUrls(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  // Filter out top-level pdf_url (rename to _pdf_url to avoid unused-var lint)
  const { pdf_url: _pdf_url, ...filteredData } = data as Record<
    string,
    unknown
  >;

  // Filter out customer.pdf_url if it exists (rename to _customerPdfUrl to avoid unused-var lint)
  if (
    filteredData.customer &&
    typeof filteredData.customer === "object" &&
    filteredData.customer !== null &&
    "pdf_url" in filteredData.customer
  ) {
    const { pdf_url: _customerPdfUrl, ...filteredCustomer } =
      filteredData.customer as Record<string, unknown>;
    filteredData.customer = filteredCustomer;
  }

  return filteredData;
}

/**
 * Custom hook for change detection polling
 * @param api - API client instance
 * @param endpoint - API endpoint to monitor
 * @param intervalMs - Polling interval in milliseconds (default: 30000)
 * @returns Change detection state and methods
 */
export function useChangeDetection(
  api: ApiClient,
  endpoint: string,
  intervalMs: number = 30000,
): UseChangeDetectionReturn {
  const [hasChanged, setHasChanged] = useState(false);
  const [_originalData, setOriginalData] = useState<unknown>(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const originalDataRef = useRef<unknown>(null);

  const startPolling = useCallback(
    (initialData: unknown) => {
      // Clear any existing interval first
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      // Remove pdf_url from initial data
      const filteredData = removePdfUrls(initialData);

      setOriginalData(filteredData);
      originalDataRef.current = filteredData; // Store in ref for stable reference
      setIsPolling(true);
      setHasChanged(false);

      intervalRef.current = setInterval(async () => {
        try {
          const currentData = (await api.get(endpoint)) as Record<
            string,
            unknown
          >;
          const data =
            (currentData as { ticket?: unknown; customer?: unknown }).ticket ||
            (currentData as { ticket?: unknown; customer?: unknown })
              .customer ||
            currentData;

          // Remove pdf_url from current data and compare
          const filteredCurrentData = removePdfUrls(data);

          const originalStr = JSON.stringify(originalDataRef.current);
          const currentStr = JSON.stringify(filteredCurrentData);

          if (originalDataRef.current && originalStr !== currentStr) {
            setHasChanged(true);
            setIsPolling(false);
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
          }
        } catch (error) {
          console.error("Error checking for changes:", error);
        }
      }, intervalMs);
    },
    [api, endpoint, intervalMs],
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
      // Remove pdf_url from new data
      const filteredData = removePdfUrls(newData);
      setOriginalData(filteredData);
      originalDataRef.current = filteredData; // Update the ref as well
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
