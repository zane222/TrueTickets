import { useMemo } from "react";
import apiClient from "../api/apiClient";

interface ApiMethods {
  get: <T = unknown>(path: string, headers?: Record<string, string>) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
  del: <T = unknown>(path: string) => Promise<T>;
}

/**
 * Custom hook for making API requests with error handling
 * @returns API methods with error handling
 */
export function useApi(): ApiMethods {
  const api = useMemo(
    () => ({
      get: async <T = unknown>(path: string, headers?: Record<string, string>): Promise<T> => {
        return await apiClient.get<T>(path, headers);
      },
      post: async <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> => {
        return await apiClient.post<T>(path, body, headers);
      },
      put: async <T = unknown>(path: string, body?: unknown, headers?: Record<string, string>): Promise<T> => {
        return await apiClient.put<T>(path, body, headers);
      },
      del: async <T = unknown>(path: string): Promise<T> => {
        return await apiClient.del<T>(path);
      },
    }),
    [],
  );

  return api;
}
