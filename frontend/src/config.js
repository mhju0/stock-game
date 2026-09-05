// Vite rejects builds without VITE_API_URL. Development uses the local API.
export const API = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
