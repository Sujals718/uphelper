import { create } from "zustand";
import type { PublicUser } from "@uphelper/shared-types";

interface AuthState {
  accessToken: string | null;
  user: PublicUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
  setSession: (accessToken: string, user: PublicUser) => void;
  clearSession: () => void;
}

/**
 * In-memory only (Zustand, no persist middleware) — on purpose. The access
 * token is short-lived (15 min) and always re-derivable from the httpOnly
 * refresh cookie via POST /auth/refresh, so writing it to localStorage would
 * buy nothing except handing an XSS payload a copy of it. A hard reload
 * wipes this store; useRequireAuth's silent refresh-on-mount is what
 * re-establishes it from the cookie.
 */
export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  status: "loading",
  setSession: (accessToken, user) => set({ accessToken, user, status: "authenticated" }),
  clearSession: () => set({ accessToken: null, user: null, status: "unauthenticated" }),
}));
