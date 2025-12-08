/**
 * Centralized API Configuration
 *
 * This module provides a single source of truth for API endpoint configuration.
 * It reads from Vite environment variables and provides sensible defaults.
 */

// Base URL for the API server
// Reads from VITE_API_URL environment variable, falls back to /portfolio/api for production or localhost:5000/api for dev
export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:5000/api' : '/portfolio/api');

// Socket.IO URL (server root, not /api)
// Handles both relative and absolute URLs
const getSocketUrl = () => {
  // Check if API_BASE_URL is relative or absolute
  const isRelative = API_BASE_URL.startsWith('/');

  if (isRelative) {
    // For relative URLs, use current origin
    return window.location.origin;
  } else {
    // For absolute URLs, extract protocol and host
    const apiUrl = new URL(API_BASE_URL);
    return `${apiUrl.protocol}//${apiUrl.host}`;
  }
};

export const SOCKET_URL = getSocketUrl();

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
    socketUrl: SOCKET_URL,
    environment: import.meta.env.MODE,
  });
}
