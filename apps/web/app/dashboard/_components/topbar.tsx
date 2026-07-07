"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PublicUser } from "@uphelper/shared-types";
import { useAuthStore } from "@/lib/auth-store";
import { logout as apiLogout } from "@/lib/api";
import { MobileNav } from "./mobile-nav";

export function Topbar({ user }: { user: PublicUser | null | undefined }) {
  const router = useRouter();
  const clearSession = useAuthStore((s) => s.clearSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (!accessToken) return;
    setLoggingOut(true);
    await apiLogout(accessToken);
    clearSession();
    router.replace("/");
  }

  return (
    <header className="flex flex-col gap-4 border-b border-white/10 px-6 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-10">
      <MobileNav />
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm text-white/90">{user?.name}</p>
          <p className="text-xs text-white/40">{user?.email}</p>
        </div>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="rounded-full border border-white/10 px-4 py-1.5 text-xs text-white/60 transition-colors hover:border-white/20 hover:text-white disabled:opacity-50"
        >
          {loggingOut ? "…" : "Sign out"}
        </button>
      </div>
    </header>
  );
}
