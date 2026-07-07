"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

const LINKS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/dashboard/contests", label: "Contests" },
  { href: "/dashboard/mistakes", label: "Mistakes" },
  { href: "/dashboard/revision", label: "Revision" },
  { href: "/dashboard/tools", label: "Tools" },
  { href: "/dashboard/analytics", label: "Analytics" },
];

// Same admin-only append as SidebarNav — kept in sync deliberately since
// both nav components list the same routes, just rendered differently
// (rail vs. horizontal scroll strip) for desktop vs. mobile.
const ADMIN_LINK = { href: "/admin", label: "Admin" };

export function MobileNav() {
  const pathname = usePathname();
  const role = useAuthStore((s) => s.user?.role);
  const links = role === "admin" ? [...LINKS, ADMIN_LINK] : LINKS;

  return (
    <nav className="flex gap-4 overflow-x-auto sm:hidden">
      {links.map((link) => {
        const active = link.href === "/dashboard" ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            className={`whitespace-nowrap border-b-2 pb-1 text-sm ${
              active ? "border-ember-500 text-ember-400" : "border-transparent text-white/50"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
