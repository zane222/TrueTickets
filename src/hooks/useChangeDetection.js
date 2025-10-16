import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Removes pdf_url from data (both top-level and nested in customer)
 * @param {Object} data - The data object to filter
 * @returns {Object} - Filtered data without pdf_url fields
 */
function removePdfUrls(data) {
  if (!data || typeof data !== 'object') return data;
  
  // Filter out top-level pdf_url
  const { pdf_url, ...filteredData } = data;
  
  // Filter out customer.pdf_url if it exists
  if (filteredData.customer && filteredData.customer.pdf_url) {
    const { pdf_url: customerPdfUrl, ...filteredCustomer } = filteredData.customer;
    filteredData.customer = filteredCustomer;
  }
  
  return filteredData;
}

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
    
    // Remove pdf_url from initial data
    const filteredData = removePdfUrls(initialData);
    
    setOriginalData(filteredData);
    originalDataRef.current = filteredData; // Store in ref for stable reference
    setIsPolling(true);
    setHasChanged(false);

    intervalRef.current = setInterval(async () => {
      try {
        const currentData = await api.get(endpoint);
        const data = currentData.ticket || currentData.customer || currentData;

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
    // Remove pdf_url from new data
    const filteredData = removePdfUrls(newData);
    setOriginalData(filteredData);
    originalDataRef.current = filteredData; // Update the ref as well
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

  return {
    hasChanged,
    isPolling,
    startPolling,
    stopPolling,
    resetPolling
  };
}