// Central API configuration
// In development: defaults to localhost
// In production: VITE_API_URL must be set at build time, or the bundle would
// silently point every request at localhost after deploy.
export const API = (() => {
  const url = import.meta.env.VITE_API_URL
  if (import.meta.env.PROD && !url) {
    throw new Error('VITE_API_URL is required in production builds')
  }
  return url || 'http://127.0.0.1:8000'
})()
