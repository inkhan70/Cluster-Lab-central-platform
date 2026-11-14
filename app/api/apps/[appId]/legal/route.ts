import { NextResponse } from "next/server";
import { appId as appIdSchema } from "@/lib/schemas";
import { LEGAL_TYPES, siteUrl } from "@/lib/legal";
import { db, requireAdmin } from "@/lib/server";

export async function GET(req: Request, { params }: { params: { appId: string } }) {
  const a = await requireAdmin(req, "apps:read");
  if (a.error) return a.error;
  if (!appIdSchema.safeParse(params.appId).success) return NextResponse.json({ error: "Invalid app ID." }, { status: 400 });
  try {
    const appSnap = await db().doc(`apps/${params.appId}`).get();
    if (!appSnap.exists) return NextResponse.json({ error: "App not found." }, { status: 404 });
    const snaps = await Promise.all(LEGAL_TYPES.map((t) => db().doc(`apps/${params.appId}/legalDocs/${t}`).get()));
    const docs = Object.fromEntries(LEGAL_TYPES.map((t, i) => [t, snaps[i].exists ? snaps[i].data() : null]));
    const d = appSnap.data() ?? {};
    return NextResponse.json({ app: { id: params.appId, name: d.name, packageId: d.packageId ?? null }, docs,
      canWrite: a.role === "owner" || a.role === "admin", siteUrl: siteUrl(req) });
  } catch (error) {
    console.error("Legal read failed", error);
    return NextResponse.json({ error: "Could not load legal documents. Check the server logs." }, { status: 500 });
  }
}
