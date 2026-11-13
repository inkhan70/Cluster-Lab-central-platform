"use client";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/client";

type AppRow = { id: string; name: string; platform: string; packageId: string | null; enabled: boolean };
type Log = { id: string; actor: string; action: string; appId: string | null; at: string };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [err, setErr] = useState("");
  const [appsError, setAppsError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [appsLoading, setAppsLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  useEffect(() => onAuthStateChanged(auth(), setUser, (error) => setErr(error.message)), []);

  const signIn = async () => {
    setErr("");
    setSigningIn(true);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth(), provider);
    } catch (error) {
      const code = (error as { code?: string }).code;
      const messages: Record<string, string> = {
        "auth/unauthorized-domain": "This app domain is not authorized in Firebase Authentication. Add the current preview or deployment hostname under Authentication → Settings → Authorized domains.",
        "auth/operation-not-allowed": "Google sign-in is not enabled for this Firebase project. Enable Google under Authentication → Sign-in method.",
        "auth/popup-blocked": "The browser blocked the Google sign-in popup. Allow pop-ups for this site or open the app in a new tab and try again.",
        "auth/popup-closed-by-user": "The Google sign-in window was closed before authentication finished.",
      };
      setErr(messages[code ?? ""] ?? `Google sign-in failed${code ? ` (${code})` : ". Check the Firebase Authentication settings and try again."}`);
    } finally {
      setSigningIn(false);
    }
  };

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const currentUser = auth().currentUser;
    if (!currentUser) throw new Error("Your sign-in session expired. Sign in again to continue.");

    const request = async (token: string) => fetch(path, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    });
    let response = await request(await currentUser.getIdToken());
    if (response.status === 401) response = await request(await currentUser.getIdToken(true));
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(`${response.status}: ${body.error ?? "request failed"}`);
    }
    return response.json();
  }, []);
  const load = useCallback(async () => {
    setAppsLoading(true);
    setAppsError("");
    setAuditError("");
    try { setApps((await call("/api/apps")).apps); }
    catch (error) { setApps(null); setAppsError(error instanceof Error ? error.message : String(error)); }
    finally { setAppsLoading(false); }
    try { setLogs((await call("/api/audit")).logs); }
    catch (error) { setLogs([]); setAuditError(error instanceof Error ? error.message : String(error)); }
  }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const toggle = async (a: AppRow) => {
    try { await call(`/api/apps/${a.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }) }); load(); }
    catch (e) { setErr(String(e)); }
  };
  if (!user) return <main><h1>Cluster Lab Central</h1>
    <button onClick={signIn} disabled={signingIn}>{signingIn ? "Opening Google sign-in…" : "Sign in with Google"}</button>
    {err && <p role="alert">{err}</p>}
  </main>;
  return <main>
    <header style={{ display: "flex", justifyContent: "space-between" }}>
      <h1>Cluster Lab Central</h1><button onClick={() => signOut(auth())}>Sign out</button></header>
    {err && <p role="alert">{err}</p>}
    <h2>Registered apps</h2>
    {appsLoading ? <p className="mut" role="status">Loading registered apps…</p> : appsError ?
      <div role="alert"><p>{appsError}</p><button onClick={load}>Retry loading apps</button>{appsError.includes("401") && <button onClick={() => signOut(auth())}>Sign out and sign in again</button>}</div> :
      apps?.length === 0 ? <p className="mut">No apps registered yet.</p> :
      <div className="grid">{apps?.map((a) => <div className="card" key={a.id}>
        <strong>{a.name}</strong><p className="mut">{a.id} · {a.platform}<br />package: {a.packageId ?? "not set"}</p>
        <button onClick={() => toggle(a)}>{a.enabled ? "Disable" : "Enable"}</button></div>)}</div>}
    <h2>Audit log</h2>
    {auditError ? <div role="alert"><p>{auditError}</p><button onClick={load}>Retry dashboard data</button></div> : logs.length === 0 ? <p className="mut">No entries, or your role cannot view them.</p> :
      <div className="card"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>App</th></tr></thead><tbody>
        {logs.map((l) => <tr key={l.id}><td>{l.at}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.appId}</td></tr>)}</tbody></table></div>}
  </main>;
}
