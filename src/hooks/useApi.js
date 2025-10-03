import { useMemo, useCallback } from 'react';
import apiClient from '../api/apiClient';
import { useAlertMethods } from '../components/AlertSystem';

/**
 * Custom hook for making API requests with error handling
 * @returns {Object} - API methods with error handling
 */
export function useApi() {
    const { showAlert } = useAlertMethods();

    const api = useMemo(() => ({
        get: async (path) => {
            try {
                return await apiClient.get(path);
            } catch (error) {
                console.error('API GET error:', error);
                showAlert(error.message || 'Failed to fetch data', 'error');
                throw error;
            }
        },
        post: async (path, body) => {
            try {
                return await apiClient.post(path, body);
            } catch (error) {
                console.error('API POST error:', error);
                showAlert(error.message || 'Failed to save data', 'error');
                throw error;
            }
        },
        put: async (path, body) => {
            try {
                return await apiClient.put(path, body);
            } catch (error) {
                console.error('API PUT error:', error);
                showAlert(error.message || 'Failed to update data', 'error');
                throw error;
            }
        },
        del: async (path) => {
            try {
                return await apiClient.del(path);
            } catch (error) {
                console.error('API DELETE error:', error);
                showAlert(error.message || 'Failed to delete data', 'error');
                throw error;
            }
        }
    }), [showAlert]);

    return api;
}
