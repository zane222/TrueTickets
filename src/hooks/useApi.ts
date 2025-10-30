import { useMemo } from "react";
import apiClient from "../api/apiClient";
import { useAlertMethods } from "../components/ui/AlertSystem";

interface ApiMethods {
  get: (path: string) => Promise<unknown>;
  post: (path: string, body?: unknown) => Promise<unknown>;
  put: (path: string, body?: unknown) => Promise<unknown>;
  del: (path: string) => Promise<unknown>;
}

/**
 * Custom hook for making API requests with error handling
 * @returns API methods with error handling
 */
export function useApi(): ApiMethods {
  const { error } = useAlertMethods();

  const api = useMemo(
    () => ({
      get: async (path: string) => {
        try {
          return await apiClient.get(path);
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
      post: async (path: string, body?: unknown) => {
        try {
          return await apiClient.post(path, body);
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
      put: async (path: string, body?: unknown) => {
        try {
          return await apiClient.put(path, body);
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
      del: async (path: string) => {
        try {
          return await apiClient.del(path);
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
