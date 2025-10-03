import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Custom hook for change detection polling
 * @param {Object} api - API client instance
 * @param {string} endpoint - API endpoint to monitor
 * @param {number} intervalMs - Polling interval in milliseconds (default: 30000)
 * @returns {Object} - Change detection state and methods
 */
export function useChangeDetection(api, endpoint, intervalMs = 30000) {
  const [hasChanged, setHasChanged] = useState(false);
  const [originalData, setOriginalData] = useState(null);
  const [isPolling, setIsPolling] = useState(false);
  const intervalRef = useRef(null);
  const originalDataRef = useRef(null);

  const startPolling = useCallback((initialData) => {    
    // Clear any existing interval first
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    setOriginalData(initialData);
    originalDataRef.current = initialData; // Store in ref for stable reference
    setIsPolling(true);
    setHasChanged(false);

    intervalRef.current = setInterval(async () => {
      try {
        const currentData = await api.get(endpoint);
        const data = currentData.ticket || currentData.customer || currentData;

        // Compare with original data using the ref
        const originalStr = JSON.stringify(originalDataRef.current);
        const currentStr = JSON.stringify(data);

        if (originalDataRef.current && originalStr !== currentStr) {
          setHasChanged(true);
          setIsPolling(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
        }
      } catch (error) {
        console.error('Error checking for changes:', error);
      }
    }, intervalMs);
    
  }, [api, endpoint, intervalMs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, [endpoint]);

  const resetPolling = useCallback((newData) => {
    stopPolling();
    setOriginalData(newData);
    originalDataRef.current = newData; // Update the ref as well
    setHasChanged(false);
  }, [stopPolling]);

  // Cleanup on unmount or when endpoint changes
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [endpoint]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return {
    hasChanged,
    isPolling,
    startPolling,
    stopPolling,
    resetPolling
  };
}