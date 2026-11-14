import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LEGAL_LABEL, legalType, renderMarkdown } from "@/lib/legal";
import { appId as appIdSchema } from "@/lib/schemas";
import { db } from "@/lib/server";

export const dynamic = "force-dynamic";
type P = { params: { appId: string; type: string } };

/** Public, read-only: only the published text of an existing app is ever returned. */
async function load({ params }: P) {
  const type = legalType.safeParse(params.type);
  if (!type.success || !appIdSchema.safeParse(params.appId).success) return null;
  try {
    const [app, doc] = await Promise.all([db().doc(`apps/${params.appId}`).get(), db().doc(`apps/${params.appId}/legalDocs/${type.data}`).get()]);
    const d = doc.data();
    if (!app.exists || !d?.publishedBody) return null;
    return { name: String(app.data()?.name ?? params.appId), label: LEGAL_LABEL[type.data], body: String(d.publishedBody), version: d.version as number, at: String(d.publishedAt ?? "") };
  } catch (error) {
    console.error("Public legal page failed", error);
    return null;
  }
}
export async function generateMetadata(p: P): Promise<Metadata> {
  const d = await load(p);
  return { title: d ? `${d.label} — ${d.name}` : "Not found", robots: { index: true, follow: true } };
}
export default async function LegalPage(p: P) {
  const d = await load(p);
  if (!d) notFound();
  return <main className="legal-page">
    <article className="legal-doc" dangerouslySetInnerHTML={{ __html: renderMarkdown(d.body) }} />
    <p className="mut">Version {d.version}{d.at ? ` · Published ${d.at.slice(0, 10)}` : ""}</p>
  </main>;
}
