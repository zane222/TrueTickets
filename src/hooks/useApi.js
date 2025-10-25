import { useMemo } from 'react';
import apiClient from '../api/apiClient';
import { useAlertMethods } from '../components/AlertSystem';

/**
 * Custom hook for making API requests with error handling
 * @returns {Object} - API methods with error handling
 */
export function useApi() {
    const { error } = useAlertMethods();

    const api = useMemo(() => ({
        get: async (path) => {
            try {
                return await apiClient.get(path);
            } catch (error) {
                console.error('API GET error:', error);
                error('Failed to fetch data', error.message || 'An error occurred while fetching data');
                throw error;
            }
        },
        post: async (path, body) => {
            try {
                return await apiClient.post(path, body);
            } catch (error) {
                console.error('API POST error:', error);
                error('Failed to save data', error.message || 'An error occurred while saving data');
                throw error;
            }
        },
        put: async (path, body) => {
            try {
                return await apiClient.put(path, body);
            } catch (error) {
                console.error('API PUT error:', error);
                error('Failed to update data', error.message || 'An error occurred while updating data');
                throw error;
            }
        },
        del: async (path) => {
            try {
                return await apiClient.del(path);
            } catch (error) {
                console.error('API DELETE error:', error);
                error('Failed to delete data', error.message || 'An error occurred while deleting data');
                throw error;
            }
        }
    }), [error]);

    return api;
}
