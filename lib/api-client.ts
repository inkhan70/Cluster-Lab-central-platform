import { auth } from "./client";
import type { ReviewNote } from "./legal";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly reviewNotes?: ReviewNote[],
  ) {
    super(`${status}: ${message}`);
    this.name = "ApiError";
  }
}

/** Authenticated call to the admin API; retries once with a fresh token. */
export async function apiCall(path: string, init: RequestInit = {}) {
  const user = auth().currentUser;
  if (!user) throw new Error("Your sign-in session expired. Sign in again to continue.");
  const send = (token: string) => fetch(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  let res = await send(await user.getIdToken());
  if (res.status === 401) res = await send(await user.getIdToken(true));
  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new ApiError(res.status, payload.error ?? "request failed", payload.code, payload.reviewNotes);
  }
  return res.json();
}
