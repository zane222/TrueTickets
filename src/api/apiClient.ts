import { fetchAuthSession, AuthSession } from "aws-amplify/auth";

interface RequestOptions {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
}

interface ApiError extends Error {
  status?: number;
  body?: unknown;
}

class ApiClient {
  public baseUrl: string;
  private cachedSession: AuthSession | null;
  private sessionExpiry: number | null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    this.cachedSession = null;
    this.sessionExpiry = null;
  }

  private isNetworkError(error: unknown): error is Error {
    return error instanceof Error && error.message === "Failed to fetch";
  }

  private isApiError(error: unknown): error is ApiError {
    return (
      error instanceof Error &&
      "status" in error &&
      typeof (error as ApiError).status === "number"
    );
  }

  async getAuthHeaders(isMultipart = false): Promise<Record<string, string>> {
    try {
      // Check if we have a cached session that's still valid
      if (
        this.cachedSession &&
        this.sessionExpiry &&
        Date.now() < this.sessionExpiry
      ) {
        const token = this.cachedSession.tokens.idToken.toString();
        return {
          ...(isMultipart ? {} : { "Content-Type": "application/json" }),
          Authorization: `Bearer ${token}`,
        };
      }

      // Fetch new session and cache it
      const session = await fetchAuthSession();
      this.cachedSession = session;

      // Cache for 5 minutes (tokens typically last 1 hour, but we refresh every 5 min to be safe)
      this.sessionExpiry = Date.now() + 5 * 60 * 1000;

      const token = session.tokens?.idToken?.toString();
      if (!token) {
        throw new Error("No authentication token available");
      }
      return {
        ...(isMultipart ? {} : { "Content-Type": "application/json" }),
        Authorization: `Bearer ${token}`,
      };
    } catch (error) {
      console.error("Error getting auth token:", error);
      throw new Error("Authentication required");
    }
  }

  async request<T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = "GET", body } = options;
    const isMultipart = body instanceof FormData;

    // Define user management endpoints that should NOT get /api prefix
    const userManagementEndpoints = [
      "/invite-user",
      "/users",
      "/update-user-group",
      "/upload-attachment",
    ];

    // Add /api prefix only for RepairShopr API calls, not for user management
    const fullPath =
      path.startsWith("/api") || userManagementEndpoints.includes(path)
        ? path
        : `/api${path}`;
    const url = `${this.baseUrl}${fullPath}`;

    // Validate that we're using API Gateway, not Lambda function URL
    if (this.baseUrl.includes("lambda-url")) {
      throw new Error(
        "Configuration error: Must use API Gateway URL, not Lambda function URL",
      );
    }

    try {
      const headers = await this.getAuthHeaders(isMultipart);

      // Merge custom headers with auth headers
      const mergedHeaders = {
        ...headers,
        ...(options.headers || {}),
      };

      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        body: isMultipart ? body : body ? JSON.stringify(body) : undefined,
      });

      // Handle 304 Not Modified - treat it as a successful response with empty body
      if (response.status === 304) {
        return {} as T;
      }

      if (!response.ok) {
        // Read the response body exactly once to avoid consuming the body stream multiple times
        let parsedErrorBody: unknown = null;
        let bodyText: string | null = null;
        try {
          bodyText = await response.text();
          try {
            parsedErrorBody = bodyText ? JSON.parse(bodyText) : null;
          } catch {
            // If it's not valid JSON, keep the raw text
            parsedErrorBody = bodyText ?? null;
          }
        } catch {
          parsedErrorBody = null;
        }

        if (response.status === 401) {
          // Token might be expired, clear cache and try to refresh
          try {
            this.cachedSession = null;
            this.sessionExpiry = null;
            const newHeaders = await this.getAuthHeaders(isMultipart);
            const mergedRetryHeaders = {
              ...newHeaders,
              ...(options.headers || {}),
            };
            const retryResponse = await fetch(url, {
              method,
              headers: mergedRetryHeaders,
              body: isMultipart ? body : body ? JSON.stringify(body) : undefined,
            });
            if (retryResponse.status === 304) {
              return {} as T;
            }
            if (!retryResponse.ok) {
              // Read retry response body once and parse if possible
              let retryParsed: unknown = null;
              try {
                const t = await retryResponse.text();
                try {
                  retryParsed = t ? JSON.parse(t) : null;
                } catch {
                  retryParsed = t ? t : null;
                }
              } catch {
                retryParsed = null;
              }
              const err: ApiError = new Error(
                (retryParsed &&
                  typeof retryParsed === "object" &&
                  "error" in retryParsed
                  ? (retryParsed as { error?: string }).error
                  : null) ||
                `${retryResponse.status} ${retryResponse.statusText}`,
              );
              err.status = retryResponse.status;
              err.body = retryParsed;
              throw err;
            }
            return (await retryResponse.json()) as T;
          } catch (retryError) {
            // If this is a network error (not an API error), re-throw it as-is
            if (this.isNetworkError(retryError)) {
              throw retryError;
            }
            // If it's an ApiError with a status code, re-throw it
            if (this.isApiError(retryError)) {
              throw retryError;
            }
            // Otherwise it's an auth issue
            throw new Error("Authentication failed. Please log in again.");
          }
        } else {
          const errorBody = parsedErrorBody as {
            details?: string;
            message?: string;
          } | null;
          const errorMessage = errorBody?.details || errorBody?.message;
          if (errorMessage) {
            // Dispatch a custom event for the UI to handle
            window.dispatchEvent(
              new CustomEvent("api-error", {
                detail: { message: errorMessage },
              }),
            );
          }
          // Throw an ApiError so callers can handle non-OK responses consistently.
          const err: ApiError = new Error(
            errorMessage || `${response.status} ${response.statusText}`,
          );
          err.status = response.status;
          err.body = parsedErrorBody;
          throw err;
        }
      }

      // Check content type to determine how to parse response
      const contentType = response.headers.get("content-type") || "";

      if (contentType.includes("image") || contentType.includes("application/octet-stream")) {
        // For binary/image responses, return blob
        return (await response.blob()) as T;
      }

      return (await response.json()) as T;
    } catch (error) {
      // Network errors (Failed to fetch) are expected when offline and will be handled silently by callers like useChangeDetection
      // Only log unexpected errors
      if (error instanceof Error && error.message === "Failed to fetch") {
        throw error;
      }
      // Log other unexpected errors for debugging
      console.error("API request failed:", error);
      throw error;
    }
  }

  // API methods (generic)
  async get<T = unknown>(path: string, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: "GET", headers: customHeaders });
  }

  async post<T = unknown>(path: string, body?: unknown, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: "POST", body, headers: customHeaders });
  }

  async put<T = unknown>(path: string, body?: unknown, customHeaders?: Record<string, string>): Promise<T> {
    return this.request<T>(path, { method: "PUT", body, headers: customHeaders });
  }

  async del<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }
}

// Create a default instance
const apiClient = new ApiClient(
  import.meta.env.VITE_API_GATEWAY_URL || "https://your-api-url.com",
);

// Export both the class and the instance
export default apiClient;
export { ApiClient };
