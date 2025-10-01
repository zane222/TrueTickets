import { fetchAuthSession } from 'aws-amplify/auth';

class LambdaClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  async getAuthHeaders() {
    try {
      const session = await fetchAuthSession();
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
      '/remove-user',
    ];
    
    // Add /api prefix only for RepairShopr API calls, not for user management
    const fullPath = path.startsWith('/api') || userManagementEndpoints.includes(path) ? path : `/api${path}`;
    const url = `${this.baseUrl}${fullPath}`;
    
    try {
      const headers = await this.getAuthHeaders();
      
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        if (response.status === 401) {
          // Token might be expired, try to refresh
          try {
            await fetchAuthSession();
            const newHeaders = await this.getAuthHeaders();
            const retryResponse = await fetch(url, {
              method,
              headers: newHeaders,
              body: body ? JSON.stringify(body) : undefined,
            });
            
            if (!retryResponse.ok) {
              throw new Error(`${retryResponse.status} ${retryResponse.statusText}`);
            }
            return await retryResponse.json();
          } catch (refreshError) {
            throw new Error('Authentication failed. Please log in again.');
          }
        }
        throw new Error(`${response.status} ${response.statusText}`);
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

export default LambdaClient;
