import { create } from "zustand";
import api from "../api/client.js";

export const useAuth = create((set) => ({
  user:  null,
  token: localStorage.getItem("ytap_token") || null,

  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("ytap_token", data.token);
    set({ token: data.token, user: data.user });
    return data.user;
  },

  logout: () => {
    localStorage.removeItem("ytap_token");
    set({ token: null, user: null });
  },

  fetchMe: async () => {
    try {
      const { data } = await api.get("/auth/me");
      set({ user: data });
    } catch {
      localStorage.removeItem("ytap_token");
      set({ token: null, user: null });
    }
  },
}));
