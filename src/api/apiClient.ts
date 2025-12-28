import { fetchAuthSession } from "aws-amplify/auth";

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
  // private cachedSession: AuthSession | null;
  // private sessionExpiry: number | null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
    // this.cachedSession = null;
    // this.sessionExpiry = null;
  }



  async getAuthHeaders(isMultipart = false, forceRefresh = false): Promise<Record<string, string>> {
    try {
      let session = await fetchAuthSession({ forceRefresh });

      if (!forceRefresh) {
        // Check if token is expired or about to expire (within 5 minutes)
        const idToken = session.tokens?.idToken;
        if (idToken?.payload?.exp) {
          const expTime = idToken.payload.exp * 1000; // Convert to ms
          const fiveMinutes = 5 * 60 * 1000;

          if (Date.now() + fiveMinutes >= expTime) {
            // Token is expiring soon, force refresh
            session = await fetchAuthSession({ forceRefresh: true });
          }
        }
      }

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

  private async retryWithFreshToken<T>(
    url: string,
    method: string,
    body: unknown,
    options: RequestOptions,
    isMultipart: boolean,
  ): Promise<T> {
    const newHeaders = await this.getAuthHeaders(isMultipart, true);
    const mergedRetryHeaders = {
      ...newHeaders,
      ...(options.headers || {}),
    };
    const retryResponse = await fetch(url, {
      method,
      headers: mergedRetryHeaders,
      body: isMultipart ? (body as BodyInit) : body ? JSON.stringify(body) : null,
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

    // Check content type to determine how to parse response
    const contentType = retryResponse.headers.get("content-type") || "";
    if (contentType.includes("image") || contentType.includes("application/octet-stream")) {
      return (await retryResponse.blob()) as T;
    }

    return (await retryResponse.json()) as T;
  }

  async request<T = unknown>(
    path: string,
    options: RequestOptions = {},
  ): Promise<T> {
    const { method = "GET", body } = options;
    const isMultipart = body instanceof FormData;

    // Use path directly without any automatic prefix
    const url = `${this.baseUrl}${path}`;

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
        body: isMultipart ? body : body ? JSON.stringify(body) : null,
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
          throw new Error("Unauthorized");
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
      if (error instanceof Error && (error.message === "Failed to fetch" || error.message === "Unauthorized")) {
        // If we haven't retried yet, assume it might be a CORS error due to expired token
        // and try to refresh the session once.
        console.warn(
          "Authentication or network error detected. Attempting to refresh session and retry request...",
        );
        try {
          return await this.retryWithFreshToken<T>(
            url,
            method,
            body,
            options,
            isMultipart,
          );
        } catch (retryError) {
          // If the retry also fails, throw the retry error (likely the same network error)
          throw retryError;
        }
      }
      // Log other unexpected errors for debugging
      console.error("API request failed:", error);
      throw error;
    }
  }

  // API methods (generic)
  async get<T = unknown>(path: string, customHeaders: Record<string, string> = {}): Promise<T> {
    return this.request<T>(path, { method: "GET", headers: customHeaders });
  }

  async post<T = unknown>(path: string, body?: unknown, customHeaders: Record<string, string> = {}): Promise<T> {
    return this.request<T>(path, { method: "POST", body, headers: customHeaders });
  }

  async put<T = unknown>(path: string, body?: unknown, customHeaders: Record<string, string> = {}): Promise<T> {
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
