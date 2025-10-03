import { useState, useEffect } from 'react';

/**
 * Custom hook for URL-based routing
 * @returns {Object} - Route state and navigation function
 */
export function useRoute() {
  const [path, setPath] = useState(window.location.pathname + window.location.search + window.location.hash);
  
  useEffect(() => {
    const updatePath = () => setPath(window.location.pathname + window.location.search + window.location.hash);
    window.addEventListener('popstate', updatePath);
    window.addEventListener('hashchange', updatePath);
    return () => { 
      window.removeEventListener('popstate', updatePath); 
      window.removeEventListener('hashchange', updatePath); 
    };
  }, []);
  
  const navigate = (to) => { 
    window.history.pushState({}, "", to); 
    window.dispatchEvent(new Event('popstate')); 
  };
  
  return { path, navigate };
}
