import { useMemo } from "react";
import apiClient from "../api/apiClient";
import { useAlertMethods } from "../components/ui/AlertSystem";

interface ApiMethods {
  get: <T = unknown>(path: string) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown) => Promise<T>;
  del: <T = unknown>(path: string) => Promise<T>;
}

/**
 * Custom hook for making API requests with error handling
 * @returns API methods with error handling
 */
export function useApi(): ApiMethods {
  const { error } = useAlertMethods();

  const api = useMemo(
    () => ({
      get: async <T = unknown>(path: string): Promise<T> => {
        try {
          return await apiClient.get<T>(path);
        } catch (err: unknown) {
          console.error("API GET error:", err);
          error(
            "Failed to fetch data",
            (err instanceof Error ? err.message : String(err)) ||
              "An error occurred while fetching data",
          );
          throw err;
        }
      },
      post: async <T = unknown>(path: string, body?: unknown): Promise<T> => {
        try {
          return await apiClient.post<T>(path, body);
        } catch (err: unknown) {
          console.error("API POST error:", err);
          error(
            "Failed to save data",
            (err instanceof Error ? err.message : String(err)) ||
              "An error occurred while saving data",
          );
          throw err;
        }
      },
      put: async <T = unknown>(path: string, body?: unknown): Promise<T> => {
        try {
          return await apiClient.put<T>(path, body);
        } catch (err: unknown) {
          console.error("API PUT error:", err);
          error(
            "Failed to update data",
            (err instanceof Error ? err.message : String(err)) ||
              "An error occurred while updating data",
          );
          throw err;
        }
      },
      del: async <T = unknown>(path: string): Promise<T> => {
        try {
          return await apiClient.del<T>(path);
        } catch (err: unknown) {
          console.error("API DELETE error:", err);
          error(
            "Failed to delete data",
            (err instanceof Error ? err.message : String(err)) ||
              "An error occurred while deleting data",
          );
          throw err;
        }
      },
    }),
    [error],
  );

  return api;
}
