"use client";

import { useRequireAuth } from "@/lib/use-require-auth";
import { SidebarNav } from "../dashboard/_components/sidebar-nav";
import { Topbar } from "../dashboard/_components/topbar";


export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isReady } = useRequireAuth("admin");

  if (!isReady) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink-950">
        <p className="text-white/50">Loading…</p>
      </main>
    );
  }

  return (
    <div className="relative flex min-h-screen bg-ink-950">
      <div
        aria-hidden
        className="pointer-events-none absolute right-0 top-0 h-[420px] w-[420px] -translate-y-1/3 translate-x-1/3 rounded-full bg-ember-500/10 blur-[140px]"
      />
      <SidebarNav />
      <div className="relative flex flex-1 flex-col">
        <Topbar user={user} />
        <main className="flex-1 px-6 py-8 sm:px-10">{children}</main>
      </div>
    </div>
  );
}
