// API Configuration
// This file handles different environments (local vs Colab)

const getApiUrl = () => {
  // Check if we're in development/production
  const isDevelopment = import.meta.env.DEV;
  
  // Priority order for API URL:
  // 1. Environment variable (set in .env file)
  // 2. Default localhost for local development
  // 3. Default ngrok-style URL for production
  
  if (import.meta.env.VITE_MODEL_SERVER_URL) {
    return import.meta.env.VITE_MODEL_SERVER_URL;
  }
  
  if (isDevelopment) {
    return 'http://localhost:5000';
  }
  
  // For production, you should set VITE_MODEL_SERVER_URL in your environment
  // This is a fallback - replace with your actual Colab ngrok URL
  return 'https://your-ngrok-url.ngrok-free.app';
};

export const API_BASE_URL = getApiUrl();

// Helper function to get the full URL for API endpoints
export const getModelServerUrl = (endpoint: string) => {
  return `${API_BASE_URL}${endpoint}`;
};

// Export the base URL for direct usage
export default API_BASE_URL;
