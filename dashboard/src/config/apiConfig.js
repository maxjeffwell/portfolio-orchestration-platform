/**
 * Centralized API Configuration
 * 
 * This module provides a single source of truth for API endpoint configuration.
 * It reads from Vite environment variables and provides sensible defaults.
 */

// Base URL for the API server
// Reads from VITE_API_URL environment variable, falls back to localhost:5000
export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// Helper function to construct full API URLs
export const getApiUrl = (resourcePath) => {
  // Ensure resourcePath starts with /
  const path = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
  return `${API_BASE_URL}${path}`;
};

// Log configuration in development mode
if (import.meta.env.DEV) {
  console.log('API Configuration:', {
    baseUrl: API_BASE_URL,
    environment: import.meta.env.MODE,
  });
}
