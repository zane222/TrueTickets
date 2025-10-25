import { fetchAuthSession } from 'aws-amplify/auth';

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
    this.cachedSession = null;
    this.sessionExpiry = null;
  }

  async getAuthHeaders() {
    try {
      // Check if we have a cached session that's still valid
      if (this.cachedSession && this.sessionExpiry && Date.now() < this.sessionExpiry) {
        const token = this.cachedSession.tokens.idToken.toString();
        return {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        };
      }

      // Fetch new session and cache it
      const session = await fetchAuthSession();
      this.cachedSession = session;
      
      // Cache for 5 minutes (tokens typically last 1 hour, but we refresh every 5 min to be safe)
      this.sessionExpiry = Date.now() + (5 * 60 * 1000);
      
      const token = session.tokens.idToken.toString();
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      };
    } catch (error) {
      console.error('Error getting auth token:', error);
      throw new Error('Authentication required');
    }
  }

  async request(path, options = {}) {
    const { method = 'GET', body } = options;
    
    // Define user management endpoints that should NOT get /api prefix
    const userManagementEndpoints = [
      '/invite-user',
      '/users', 
      '/update-user-group',
    ];
    
    // Add /api prefix only for RepairShopr API calls, not for user management
    const fullPath = path.startsWith('/api') || userManagementEndpoints.includes(path) ? path : `/api${path}`;
    const url = `${this.baseUrl}${fullPath}`;
    
    // Validate that we're using API Gateway, not Lambda function URL
    if (this.baseUrl.includes('lambda-url')) {
      throw new Error('Configuration error: Must use API Gateway URL, not Lambda function URL');
    }
    
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        // Try to parse any JSON error body so callers can display server messages
        let parsedErrorBody = null;
        try {
          const text = await response.text();
          parsedErrorBody = text ? JSON.parse(text) : null;
        } catch (parseErr) {
          // ignore parse errors, keep raw text
          try { parsedErrorBody = await response.text(); } catch(e) { parsedErrorBody = null; }
        }

        if (response.status === 401) {
          // Token might be expired, clear cache and try to refresh
          try {
            this.cachedSession = null;
            this.sessionExpiry = null;
            const newHeaders = await this.getAuthHeaders();
            const retryResponse = await fetch(url, {
              method,
              headers: newHeaders,
              body: body ? JSON.stringify(body) : undefined,
            });
            if (!retryResponse.ok) {
              // try to parse retry response body
              let retryParsed = null;
              try {
                const t = await retryResponse.text();
                retryParsed = t ? JSON.parse(t) : null;
              } catch (e) {
                try { retryParsed = await retryResponse.text(); } catch(e) { retryParsed = null; }
              }
              const err = new Error(retryParsed?.error || `${retryResponse.status} ${retryResponse.statusText}`);
              err.status = retryResponse.status;
              err.body = retryParsed;
              throw err;
            }
            return await retryResponse.json();
          } catch (refreshError) {
            throw new Error('Authentication failed. Please log in again.');
          }
        }
        // Throw an error with status and parsed body where possible
        const errorToThrow = new Error(parsedErrorBody?.error || parsedErrorBody?.message || `${response.status} ${response.statusText}`);
        errorToThrow.status = response.status;
        errorToThrow.body = parsedErrorBody;
        throw errorToThrow;
      }

      return await response.json();
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // API methods
  async get(path) {
    return this.request(path, { method: 'GET' });
  }

  async post(path, body) {
    return this.request(path, { method: 'POST', body });
  }

  async put(path, body) {
    return this.request(path, { method: 'PUT', body });
  }

  async del(path) {
    return this.request(path, { method: 'DELETE' });
  }
}

// Create a default instance
const apiClient = new ApiClient(import.meta.env.VITE_API_GATEWAY_URL || 'https://your-api-url.com');

// Export both the class and the instance
export default apiClient;
export { ApiClient };
