import axios from "axios";

// Local dev: proxy /api → localhost:4000
// Self-hosted/production: VITE_API_URL, else same-origin /api
const BASE = import.meta.env.VITE_API_URL ? `${import.meta.env.VITE_API_URL}/api` : "/api";
const api = axios.create({ baseURL: BASE });

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("ytap_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Auto-logout only when OUR session token is actually rejected.
// A 401 from /auth/login just means wrong password — the login page shows that
// itself, and clearing state here would reload the page before the error renders.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const url    = err.config?.url || "";
    const isLoginAttempt = url.includes("/auth/login");
    if (status === 401 && !isLoginAttempt) {
      localStorage.removeItem("ytap_token");
      // The app is a single page with no router — reload at root so it
      // re-renders the login screen ("/login" would 404 on some hosts).
      window.location.replace("/");
    }
    return Promise.reject(err);
  }
);

export default api;
