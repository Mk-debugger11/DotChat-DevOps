import { create } from "zustand";

interface AuthState {
  token: string;
  isAuthenticated: boolean;
  setToken: (token: string) => void;
  clearToken: () => void;
}

function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("token") || "";
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getAccessToken(),
  isAuthenticated: !!getAccessToken(),

  setToken: (token: string) => {
    localStorage.setItem("token", token);
    set({ token: token, isAuthenticated: true });
  },
  clearToken: () => {
    localStorage.removeItem("token");
    set({ token: "", isAuthenticated: false });
  },
}));
