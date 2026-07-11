import axios from "axios";

// Local dev: proxy /api → localhost:4000
// Production: VITE_API_URL env var set karo (e.g. https://your-backend.up.railway.app)
const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api";
const api = axios.create({ baseURL: BASE });

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ytap_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("ytap_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
