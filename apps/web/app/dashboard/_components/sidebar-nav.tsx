"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { useAuthStore } from "@/lib/auth-store";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/contests", label: "Contests" },
  { href: "/dashboard/mistakes", label: "Mistakes" },
  { href: "/dashboard/revision", label: "Revision" },
  { href: "/dashboard/tools", label: "Tools" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

// Appended, not baked into LINKS above, and only ever shown when the
// signed-in user's role is 'admin' (checked in the component body) —
// never inferred from the current route. /admin lives outside
// app/dashboard/* (it has its own layout.tsx mirroring this shell), so
// this is the one link in this list that doesn't start with /dashboard.
const ADMIN_LINK = { href: "/admin", label: "Admin" };

export function SidebarNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const links = role === "admin" ? [...LINKS, ADMIN_LINK] : LINKS;

  return (
    <nav className="hidden w-60 shrink-0 flex-col gap-1 border-r border-white/10 bg-ink-900/40 px-4 py-8 sm:flex">
      <Link href="/dashboard" className="mb-8 px-2 font-display text-lg text-white">
        Uphelper
      </Link>
      {links.map((link) => {
        const active = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} className="relative rounded-lg px-3 py-2 text-sm">
            {active && (
              <motion.span
                layoutId="nav-active-pill"
                className="absolute inset-0 rounded-lg bg-ember-500/15"
                transition={{ type: "spring", stiffness: 400, damping: 32 }}
              />
            )}
            <span className={`relative z-10 ${active ? "text-ember-400" : "text-white/60 hover:text-white/90"}`}>
              {link.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
