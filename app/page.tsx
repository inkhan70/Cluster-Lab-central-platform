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
  useEffect(() => onAuthStateChanged(auth(), setUser), []);

  const call = useCallback(async (path: string, init: RequestInit = {}) => {
    const t = await auth().currentUser?.getIdToken();
    const r = await fetch(path, { ...init, headers: { "content-type": "application/json", authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error(`${r.status}: ${(await r.json().catch(() => ({}))).error ?? "request failed"}`);
    return r.json();
  }, []);
  const load = useCallback(async () => {
    setErr("");
    try { setApps((await call("/api/apps")).apps); } catch (e) { setErr(String(e)); }
    try { setLogs((await call("/api/audit")).logs); } catch { setLogs([]); }
  }, [call]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const toggle = async (a: AppRow) => {
    try { await call(`/api/apps/${a.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !a.enabled }) }); load(); }
    catch (e) { setErr(String(e)); }
  };
  if (!user) return <main><h1>Cluster Lab Central</h1>
    <button onClick={() => signInWithPopup(auth(), new GoogleAuthProvider())}>Sign in with Google</button></main>;
  return <main>
    <header style={{ display: "flex", justifyContent: "space-between" }}>
      <h1>Cluster Lab Central</h1><button onClick={() => signOut(auth())}>Sign out</button></header>
    {err && <p role="alert">{err}</p>}
    <h2>Registered apps</h2>
    {apps === null ? <p className="mut">Loading…</p> : apps.length === 0 ? <p className="mut">No apps registered yet.</p> :
      <div className="grid">{apps.map((a) => <div className="card" key={a.id}>
        <strong>{a.name}</strong><p className="mut">{a.id} · {a.platform}<br />package: {a.packageId ?? "not set"}</p>
        <button onClick={() => toggle(a)}>{a.enabled ? "Disable" : "Enable"}</button></div>)}</div>}
    <h2>Audit log</h2>
    {logs.length === 0 ? <p className="mut">No entries, or your role cannot view them.</p> :
      <div className="card"><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>App</th></tr></thead><tbody>
        {logs.map((l) => <tr key={l.id}><td>{l.at}</td><td>{l.actor}</td><td>{l.action}</td><td>{l.appId}</td></tr>)}</tbody></table></div>}
  </main>;
}
