"use client";
import { GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { auth } from "@/lib/client";

type AppRow = { id: string; name: string; platform: string; packageId: string | null; enabled: boolean };
type Log = { id: string; actor: string; action: string; appId: string | null; at: string };
type AppsResponse = { apps: AppRow[]; canWrite: boolean };

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);
  const [apps, setApps] = useState<AppRow[] | null>(null);
  const [logs, setLogs] = useState<Log[]>([]);
  const [err, setErr] = useState("");
  const [appsError, setAppsError] = useState("");
  const [auditError, setAuditError] = useState("");
  const [appsLoading, setAppsLoading] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [appId, setAppId] = useState("");
  const [appName, setAppName] = useState("");
  const [platform, setPlatform] = useState<"android" | "web" | "both">("both");
  const [packageId, setPackageId] = useState("");
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
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
    try {
      const result = await call("/api/apps") as AppsResponse;
      setApps(result.apps);
      setCanWrite(result.canWrite);
    } catch (error) {
      setApps(null);
      setCanWrite(false);
      setAppsError(error instanceof Error ? error.message : String(error));
    } finally {
      setAppsLoading(false);
    }
    try { setLogs((await call("/api/audit")).logs); }
    catch (error) { setLogs([]); setAuditError(error instanceof Error ? error.message : String(error)); }
  }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const createApp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    setCreating(true);
    try {
      await call("/api/apps", {
        method: "POST",
        body: JSON.stringify({
          appId: appId.trim(),
          name: appName.trim(),
          platform,
          packageId: packageId.trim() || null,
        }),
      });
      setAppId("");
      setAppName("");
      setPlatform("both");
      setPackageId("");
      await load();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreating(false);
    }
  };

  const toggle = async (a: AppRow) => {
    try { await call(`/api/apps/${a.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }) }); await load(); }
    catch (e) { setErr(String(e)); }
  };
  if (!user) return <main className="page-shell"><section className="login-card">
    <p className="eyebrow">CLUSTER LAB CENTRAL</p><h1>Admin dashboard</h1>
    <p className="mut">Sign in with your authorized Google account to manage registered apps.</p>
    <button onClick={signIn} disabled={signingIn}>{signingIn ? "Opening Google sign-in…" : "Sign in with Google"}</button>
    {err && <p role="alert" className="form-error">{err}</p>}
  </section></main>;
  return <main className="page-shell">
    <header className="page-header">
      <div><p className="eyebrow">CLUSTER LAB CENTRAL</p><h1>Admin dashboard</h1><p className="mut">Manage app registrations, rollout status, and access activity.</p></div>
      <button className="button-secondary" onClick={() => signOut(auth())}>Sign out</button>
    </header>
    {err && <p role="alert" className="form-error">{err}</p>}
    {canWrite && <section className="card workflow-card" aria-labelledby="register-heading">
      <div className="section-heading"><div><p className="eyebrow">APP WORKFLOW</p><h2 id="register-heading">Register an app</h2><p className="mut">Create a disabled app record first. You can enable it after verifying its details.</p></div></div>
      <form onSubmit={createApp} className="app-form">
        <div className="form-grid">
          <label className="form-field">App name
            <input value={appName} onChange={(event) => setAppName(event.target.value)} maxLength={80} required placeholder="e.g. QuickShare" autoComplete="off" />
          </label>
          <label className="form-field">App ID
            <input value={appId} onChange={(event) => setAppId(event.target.value.toLowerCase().replace(/\s+/g, "-"))} pattern="[a-z0-9][a-z0-9-]{1,38}" title="Use 2–39 lowercase letters, numbers, or hyphens; start with a letter or number." required placeholder="e.g. quickshare" autoComplete="off" />
            <span className="field-hint">2–39 characters; lowercase letters, numbers, and hyphens.</span>
          </label>
          <label className="form-field">Platform
            <select value={platform} onChange={(event) => setPlatform(event.target.value as "android" | "web" | "both")}>
              <option value="both">Android and web</option><option value="android">Android</option><option value="web">Web</option>
            </select>
          </label>
          <label className="form-field">Package ID <span className="field-optional">Optional</span>
            <input value={packageId} onChange={(event) => setPackageId(event.target.value.trim())} pattern="[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+" title="Use a dotted package identifier, such as com.example.app." placeholder="com.example.app" autoComplete="off" />
            <span className="field-hint">Required only when you have a verified Android package ID.</span>
          </label>
        </div>
        {createError && <p className="form-error" role="alert">{createError}</p>}
        <div className="form-footer"><p className="mut">New registrations are created disabled for review.</p><button type="submit" disabled={creating}>{creating ? "Registering…" : "Register app"}</button></div>
      </form>
    </section>}
    <section className="dashboard-section" aria-labelledby="apps-heading">
      <div className="section-heading"><div><p className="eyebrow">REGISTRY</p><h2 id="apps-heading">Registered apps</h2></div><button className="button-secondary" onClick={load} disabled={appsLoading}>{appsLoading ? "Refreshing…" : "Refresh"}</button></div>
      {appsLoading && !apps ? <p className="mut" role="status">Loading registered apps…</p> : appsError ?
        <div className="card" role="alert"><p>{appsError}</p><button onClick={load}>Retry loading apps</button>{appsError.includes("401") && <button className="button-secondary" onClick={() => signOut(auth())}>Sign out and sign in again</button>}</div> :
        apps?.length === 0 ? <div className="empty-state"><h3>No apps registered yet</h3><p className="mut">Use the registration form above to add your first app. It will remain disabled until you enable it.</p></div> :
        <div className="grid">{apps?.map((a) => <article className="card app-card" key={a.id}>
          <div className="app-card-top"><div><p className="eyebrow">{a.platform}</p><h3>{a.name}</h3></div><span className={`status-badge ${a.enabled ? "is-enabled" : "is-disabled"}`}>{a.enabled ? "Enabled" : "Review required"}</span></div>
          <p className="app-meta"><code>{a.id}</code><span>{a.packageId ?? "No package ID"}</span></p>
          {canWrite && <button className={a.enabled ? "button-secondary" : ""} onClick={() => toggle(a)}>{a.enabled ? "Disable app" : "Enable app"}</button>}
        </article>)}</div>}
    </section>
    <section className="dashboard-section" aria-labelledby="audit-heading">
      <div className="section-heading"><div><p className="eyebrow">ACTIVITY</p><h2 id="audit-heading">Audit log</h2></div></div>
      {auditError ? <div className="card" role="alert"><p>{auditError}</p><button onClick={load}>Retry dashboard data</button></div> : logs.length === 0 ? <p className="mut">No entries, or your role cannot view them.</p> :
        <div className="card table-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>App</th></tr></thead><tbody>
          {logs.map((l) => <tr key={l.id}><td>{l.at}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.appId ?? "—"}</td></tr>)}</tbody></table></div>}
    </section>
  </main>;
}
