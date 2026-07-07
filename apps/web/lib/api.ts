import type { AuthTokenResponse, PublicUser } from "@uphelper/shared-types";

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";

export function startGoogleLogin(): void {
  // Real top-level navigation, not fetch — the OAuth consent screen has to
  // happen in the browser's address bar.
  window.location.href = `${API_ORIGIN}/auth/google`;
}

/**
 * Result of the post-OAuth `/users/me` check. This is a distinct shape
 * from a plain `PublicUser | null` specifically so the auth callback page
 * can tell "your account has been disabled" apart from every other
 * failure (network error, malformed token, etc.) and show the accurate
 * message instead of a generic "something went wrong" for both.
 */
export type FetchMeResult =
  | { status: "ok"; user: PublicUser }
  | { status: "disabled" }
  | { status: "error" };

/** Fetches the current user's profile using a bearer access token. */
export async function fetchMe(accessToken: string): Promise<FetchMeResult> {
  const res = await fetch(`${API_ORIGIN}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.ok) {
    return { status: "ok", user: await res.json() };
  }

  if (res.status === 403) {
    const body = (await res.json().catch(() => undefined)) as { message?: string } | undefined;
    if (body?.message === "Account has been disabled") {
      return { status: "disabled" };
    }
  }

  return { status: "error" };
}

/**
 * Exchanges the httpOnly refresh cookie for a fresh access token + user.
 * Used on a hard page reload, since that wipes the in-memory Zustand store
 * but not the cookie the API set during the OAuth callback.
 */
export async function refreshSession(): Promise<AuthTokenResponse | null> {
  const res = await fetch(`${API_ORIGIN}/auth/refresh`, {
    method: "POST",
    credentials: "include", // required so the httpOnly refresh cookie is actually sent
  });
  if (!res.ok) return null;
  return res.json();
}

export async function logout(accessToken: string): Promise<void> {
  await fetch(`${API_ORIGIN}/auth/logout`, {
    method: "POST",
    credentials: "include",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}
