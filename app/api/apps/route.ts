import { NextResponse } from "next/server";
import { appCreate } from "@/lib/schemas";
import { audit, db, requireAdmin } from "@/lib/server";

export async function GET(req: Request) {
  const a = await requireAdmin(req, "apps:read");
  if (a.error) return a.error;
  const snap = await db().collection("apps").orderBy("name").get();
  return NextResponse.json({
    apps: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
    canWrite: a.role === "owner" || a.role === "admin",
  });
}
export async function POST(req: Request) {
  const a = await requireAdmin(req, "apps:write");
  if (a.error) return a.error;
  const p = appCreate.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const ref = db().doc(`apps/${p.data.appId}`);
  if ((await ref.get()).exists) return NextResponse.json({ error: "app exists" }, { status: 409 });
  await ref.set({ ...p.data, enabled: false, supportEnabled: false, privacyPolicyUrl: null,
    createdAt: new Date().toISOString() });
  await audit(a.uid!, "app.create", p.data.appId, { packageId: p.data.packageId });
  return NextResponse.json({ ok: true }, { status: 201 });
}
