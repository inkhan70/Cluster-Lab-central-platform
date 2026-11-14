import { auth } from "./client";

/** Authenticated call to the admin API; retries once with a fresh token. */
export async function apiCall(path: string, init: RequestInit = {}) {
  const user = auth().currentUser;
  if (!user) throw new Error("Your sign-in session expired. Sign in again to continue.");
  const send = (token: string) => fetch(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${token}` } });
  let res = await send(await user.getIdToken());
  if (res.status === 401) res = await send(await user.getIdToken(true));
  if (!res.ok) throw new Error(`${res.status}: ${(await res.json().catch(() => ({}))).error ?? "request failed"}`);
  return res.json();
}
