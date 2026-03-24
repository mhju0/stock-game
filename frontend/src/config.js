// Central API configuration
// In development: defaults to localhost
// In production: set VITE_API_URL in your .env file
export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
