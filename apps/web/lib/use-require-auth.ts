"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { UserRole } from "@uphelper/shared-types";
import { useAuthStore } from "./auth-store";
import { refreshSession } from "./api";


export function useRequireAuth(requiredRole?: UserRole) {
  const router = useRouter();
  const { user, status, setSession, clearSession } = useAuthStore();

  useEffect(() => {
    if (status === "authenticated") {
      if (requiredRole && user?.role !== requiredRole) router.replace("/");
      return;
    }

    let cancelled = false;
    (async () => {
      const session = await refreshSession();
      if (cancelled) return;

      if (!session) {
        clearSession();
        router.replace("/");
        return;
      }

      setSession(session.accessToken, session.user);
      if (requiredRole && session.user.role !== requiredRole) router.replace("/");
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return { user, isReady: status === "authenticated" };
}
