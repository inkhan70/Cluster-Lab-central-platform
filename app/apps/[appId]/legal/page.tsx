"use client";
import { onAuthStateChanged, User } from "firebase/auth";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiCall } from "@/lib/api-client";
import { auth } from "@/lib/client";
import { generateTemplate, LEGAL_LABEL, LEGAL_TYPES, LegalType, LegalVars, legalState, playChecklist, renderMarkdown, STATE_TEXT } from "@/lib/legal";

type Doc = { body: string; vars: LegalVars; publishedBody?: string | null; version?: number; publishedAt?: string };
type Loaded = { app: { id: string; name: string }; docs: Record<LegalType, Doc | null>; canWrite: boolean; siteUrl: string };
const FLAGS: [keyof LegalVars, string][] = [
  ["usesAccounts", "The app has user accounts or sign-in"], ["userContent", "Users create or upload content"],
  ["usesAnalytics", "The app uses analytics or crash reporting"], ["usesAds", "The app shows ads (for example AdMob)"],
  ["collectsLocation", "The app accesses device location"], ["acceptsSupport", "The app offers optional voluntary support"],
  ["targetsChildren", "The app is designed for children"],
];
const blank = (): LegalVars => ({ developerName: "", contactEmail: "", website: "", accountDeletionUrl: "", governingLaw: "",
  effectiveDate: new Date().toISOString().slice(0, 10), usesAccounts: false, userContent: false, usesAnalytics: false, usesAds: false,
  collectsLocation: false, acceptsSupport: false, targetsChildren: false });

export default function LegalEditor() {
  const { appId } = useParams<{ appId: string }>();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [data, setData] = useState<Loaded | null>(null);
  const [tab, setTab] = useState<LegalType>("privacy");
  const [vars, setVars] = useState<LegalVars>(blank());
  const [bodies, setBodies] = useState<Record<LegalType, string>>({ privacy: "", terms: "" });
  const [error, setError] = useState(""); const [note, setNote] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => onAuthStateChanged(auth(), setUser), []);

  const load = useCallback(async () => {
    setError("");
    try {
      const r = await apiCall(`/api/apps/${appId}/legal`) as Loaded;
      setData(r);
      setVars(r.docs.privacy?.vars ?? r.docs.terms?.vars ?? blank());
      setBodies({ privacy: r.docs.privacy?.body ?? "", terms: r.docs.terms?.body ?? "" });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [appId]);
  useEffect(() => { if (user) load(); }, [user, load]);

  const doc = data?.docs[tab] ?? null;
  const body = bodies[tab];
  const state = legalState({ body, publishedBody: doc?.publishedBody });
  const dirty = body !== (doc?.body ?? "");
  const url = `${data?.siteUrl ?? ""}/legal/${appId}/${tab}`;
  const checks = useMemo(() => playChecklist({ state, body, vars, publicUrl: url }), [state, body, vars, url]);
  const setVar = (k: keyof LegalVars, v: string | boolean) => setVars((p) => ({ ...p, [k]: v }));

  const generate = () => {
    if (body.trim() && !confirm("Replace the current text with a fresh template? Unsaved edits will be lost.")) return;
    setBodies((b) => ({ ...b, [tab]: generateTemplate(tab, data!.app.name, vars) })); setNote("");
  };
  const run = async (publish: boolean) => {
    setBusy(true); setError(""); setNote("");
    try {
      await apiCall(`/api/apps/${appId}/legal/${tab}`, { method: "PUT", body: JSON.stringify({ vars, body }) });
      if (publish) { const r = await apiCall(`/api/apps/${appId}/legal/${tab}`, { method: "POST" }); setNote(`Published version ${r.version}. Public URL: ${r.url}`); }
      else setNote("Draft saved. The public page is unchanged until you publish.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };

  if (user === undefined) return <main className="page-shell"><p className="mut" role="status">Loading…</p></main>;
  if (!user) return <main className="page-shell"><section className="login-card"><h1>Sign in required</h1><p className="mut">Open the <a href="/">dashboard</a> and sign in first.</p></section></main>;
  const w = !!data?.canWrite;
  return <main className="page-shell">
    <header className="page-header"><div><p className="eyebrow">LEGAL PAGES</p><h1>{data?.app.name ?? appId}</h1><p className="mut">Edit, publish, and share your privacy policy and terms of use. Published pages are public so Google Play can read them.</p></div><a className="button-link" href="/">← Dashboard</a></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {note && <p className="form-note" role="status">{note}</p>}
    {!data ? !error && <p className="mut" role="status">Loading legal documents…</p> : <>
      <section className="card workflow-card"><h2>Details</h2><p className="mut">Shared by both documents. These fill the template; they do not change text you already wrote.</p>
        <div className="form-grid">
          {([["developerName", "Developer or company name", "text"], ["contactEmail", "Contact email (public)", "email"], ["website", "Website (optional)", "url"], ["accountDeletionUrl", "Account deletion URL (optional)", "url"], ["governingLaw", "Governing law, e.g. Pakistan (optional)", "text"], ["effectiveDate", "Effective date", "date"]] as const).map(([k, label, type]) =>
            <label className="form-field" key={k}>{label}<input type={type} value={String(vars[k])} disabled={!w} onChange={(e) => setVar(k, e.target.value)} /></label>)}
        </div>
        <fieldset className="flag-list"><legend>What does this app actually do?</legend>
          {FLAGS.map(([k, label]) => <label key={k}><input type="checkbox" checked={Boolean(vars[k])} disabled={!w} onChange={(e) => setVar(k, e.target.checked)} /> {label}</label>)}
        </fieldset>
        <p className="mut">Only tick what is true. The template is a starting point, not legal advice, and your policy must match your real data practices and your Play Data safety form.</p>
      </section>
      <div className="tabs" role="tablist">{LEGAL_TYPES.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "" : "button-secondary"} onClick={() => { setTab(t); setNote(""); }}>{LEGAL_LABEL[t]}</button>)}</div>
      <section className="card" aria-label={LEGAL_LABEL[tab]}>
        <div className="section-heading"><div><h2>{LEGAL_LABEL[tab]}</h2><p className="mut">{dirty ? "Unsaved changes · " : ""}{doc?.version ? `Version ${doc.version} live` : "Not published"}</p></div><span className={`status-badge legal-${state}`}>{STATE_TEXT[state]}</span></div>
        <div className="editor-grid">
          <label className="form-field">Text (Markdown: #, ##, - lists, **bold**, [links](https://…))<textarea value={body} disabled={!w} onChange={(e) => setBodies((b) => ({ ...b, [tab]: e.target.value }))} rows={22} spellCheck /></label>
          <div><p className="eyebrow">Preview</p><div className="legal-doc preview" dangerouslySetInnerHTML={{ __html: renderMarkdown(body) || "<p>Nothing to preview yet.</p>" }} /></div>
        </div>
        {w && <div className="form-footer"><button className="button-secondary" onClick={generate} disabled={busy}>Generate from template</button>
          <span className="button-row"><button className="button-secondary" onClick={() => run(false)} disabled={busy || !body.trim()}>Save draft</button><button onClick={() => run(true)} disabled={busy || !body.trim()}>{busy ? "Working…" : "Save and publish"}</button></span></div>}
        <p className="mut">Public URL: <code>{url}</code> <button className="button-secondary" onClick={() => navigator.clipboard?.writeText(url)}>Copy</button></p>
        {tab === "privacy" && <div className="check-list"><p className="eyebrow">Google Play Console checklist</p><ul>{checks.map((c) => <li key={c.id}><span aria-hidden>{c.manual ? "☐" : c.ok ? "✅" : "⚠️"}</span> {c.label}{!c.ok && <span className="field-hint"> — {c.hint}</span>}</li>)}</ul></div>}
      </section></>}
  </main>;
}
