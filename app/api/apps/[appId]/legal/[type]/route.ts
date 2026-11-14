import { NextResponse } from "next/server";
import { appId as appIdSchema } from "@/lib/schemas";
import { hasReviewMarker, legalSave, legalState, legalType, legalVars, publicPath, siteUrl, zodMessage } from "@/lib/legal";
import { audit, db, requireAdmin } from "@/lib/server";

type Ctx = { params: { appId: string; type: string } };
class Blocked extends Error {}
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

async function guard(req: Request, ctx: Ctx) {
  const a = await requireAdmin(req, "apps:write");
  if (a.error) return { res: a.error };
  const type = legalType.safeParse(ctx.params.type);
  if (!appIdSchema.safeParse(ctx.params.appId).success || !type.success) return { res: bad("Invalid app ID or document type.") };
  const appRef = db().doc(`apps/${ctx.params.appId}`);
  if (!(await appRef.get()).exists) return { res: bad("App not found.", 404) };
  return { uid: a.uid!, type: type.data, appRef, ref: db().doc(`apps/${ctx.params.appId}/legalDocs/${type.data}`) };
}

/** Save a draft. Never touches the published text. */
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.res) return g.res;
  const p = legalSave.safeParse(await req.json().catch(() => null));
  if (!p.success) return bad(zodMessage(p.error));
  try {
    await g.ref.set({ type: g.type, vars: p.data.vars, body: p.data.body, updatedAt: new Date().toISOString(), updatedBy: g.uid }, { merge: true });
    const state = legalState((await g.ref.get()).data());
    await g.appRef.set({ legal: { [g.type]: state } }, { merge: true });
    await audit(g.uid, "legal.save", ctx.params.appId, { type: g.type, chars: p.data.body.length });
    return NextResponse.json({ ok: true, state });
  } catch (error) {
    console.error("Legal save failed", error);
    return bad("Could not save the document. Check the server logs.", 500);
  }
}

/** Publish the saved draft: versioned, with history, and blocked while [REVIEW] notes remain. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(req, ctx);
  if (g.res) return g.res;
  const now = new Date().toISOString();
  let version = 0;
  try {
    await db().runTransaction(async (tx) => {
      const d = (await tx.get(g.ref)).data();
      if (!d?.body?.trim()) throw new Blocked("Save a draft before publishing.");
      if (hasReviewMarker(d.body)) throw new Blocked("Resolve every [REVIEW: …] note before publishing.");
      if (!legalVars.safeParse(d.vars).success) throw new Blocked("Complete the developer name, contact email, and effective date first.");
      version = (d.version ?? 0) + 1;
      tx.set(g.ref, { publishedBody: d.body, publishedVars: d.vars, version, publishedAt: now, publishedBy: g.uid }, { merge: true });
      tx.set(g.ref.collection("history").doc(String(version)), { body: d.body, vars: d.vars, publishedAt: now, publishedBy: g.uid });
    });
    const url = siteUrl(req) + publicPath(ctx.params.appId, g.type);
    await g.appRef.set({ legal: { [g.type]: "published" }, ...(g.type === "privacy" ? { privacyPolicyUrl: url } : { termsUrl: url }) }, { merge: true });
    await audit(g.uid, "legal.publish", ctx.params.appId, { type: g.type, version });
    return NextResponse.json({ ok: true, version, url });
  } catch (error) {
    if (error instanceof Blocked) return bad(error.message, 422);
    console.error("Legal publish failed", error);
    return bad("Could not publish the document. Check the server logs.", 500);
  }
}
