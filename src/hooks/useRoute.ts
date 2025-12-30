import { useState, useEffect, useCallback, useMemo } from "react";

interface UseRouteReturn {
  path: string;
  navigate: (to: string) => void;
}

/**
 * Custom hook for URL-based routing
 * @returns Route state and navigation function
 */
export function useRoute(): UseRouteReturn {
  const [path, setPath] = useState(
    window.location.pathname + window.location.search + window.location.hash,
  );

  useEffect(() => {
    const updatePath = () =>
      setPath(
        window.location.pathname +
        window.location.search +
        window.location.hash,
      );
    window.addEventListener("popstate", updatePath);
    window.addEventListener("hashchange", updatePath);
    return () => {
      window.removeEventListener("popstate", updatePath);
      window.removeEventListener("hashchange", updatePath);
    };
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, "", to);
    window.dispatchEvent(new Event("popstate"));
  }, []);

  return useMemo(() => ({ path, navigate }), [path, navigate]);
}
