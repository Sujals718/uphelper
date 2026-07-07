import { API_ORIGIN, refreshSession } from "./api";
import { useAuthStore } from "./auth-store";


export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}


export class AccountDisabledError extends ApiError {
  constructor() {
    super(403, "Account has been disabled.");
    this.name = "AccountDisabledError";
  }
}

async function parseBody(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const call = (token: string | null) =>
    fetch(`${API_ORIGIN}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });

  let res = await call(useAuthStore.getState().accessToken);

  if (res.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed) {
      useAuthStore.getState().setSession(refreshed.accessToken, refreshed.user);
      res = await call(refreshed.accessToken);
    } else {
      useAuthStore.getState().clearSession();
    }
  }

  if (!res.ok) {
    const body = (await parseBody(res)) as { message?: string | string[] } | undefined;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? res.statusText);

    if (res.status === 403 && message === "Account has been disabled") {
      throw new AccountDisabledError();
    }

    throw new ApiError(res.status, message);
  }

  return (await parseBody(res)) as T;
}
