"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchMe } from "@/lib/api";
import { useAuthStore } from "@/lib/auth-store";

export default function AuthCallbackPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  // Distinguishing "disabled" from every other failure here is the whole
  // point of this state — a disabled user re-signing in used to land on
  // the same generic "Something went wrong" copy as a genuinely broken
  // sign-in, with no way to tell the two apart.
  const [status, setStatus] = useState<"loading" | "error" | "disabled">("loading");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // The API redirects here as:
      //   /auth/callback#accessToken=<jwt>&redirect=/dashboard
      // A URL fragment, not a query string, because fragments are never
      // sent to any server (ours or an intermediary's) and never appear in
      // server access logs — this is the one and only place the access
      // token exists outside of memory, and only for a moment.
      const params = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = params.get("accessToken");
      const redirectTarget = params.get("redirect") ?? "/dashboard";

      if (!accessToken) {
        setStatus("error");
        return;
      }

      const result = await fetchMe(accessToken);
      if (cancelled) return;

      if (result.status === "disabled") {
        setStatus("disabled");
        return;
      }

      if (result.status === "error") {
        setStatus("error");
        return;
      }

      setSession(accessToken, result.user);
      // Clear the fragment from the address bar now that we've consumed it.
      window.history.replaceState(null, "", window.location.pathname);
      router.replace(redirectTarget);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, setSession]);

  if (status === "disabled") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/70">Your account has been disabled.</p>
        <a href="/" className="text-ember-400 underline underline-offset-4">
          Back to the homepage
        </a>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-white/70">Something went wrong signing you in.</p>
        <a href="/" className="text-ember-400 underline underline-offset-4">
          Back to the homepage
        </a>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-white/50">Signing you in…</p>
    </main>
  );
}