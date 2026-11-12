import { NextResponse } from "next/server";
import { appId, appPatch } from "@/lib/schemas";
import { audit, db, requireAdmin } from "@/lib/server";

export async function PATCH(req: Request, { params }: { params: { appId: string } }) {
  const a = await requireAdmin(req, "apps:write");
  if (a.error) return a.error;
  if (!appId.safeParse(params.appId).success) return NextResponse.json({ error: "bad app id" }, { status: 400 });
  const p = appPatch.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: p.error.flatten() }, { status: 400 });
  const ref = db().doc(`apps/${params.appId}`);
  if (!(await ref.get()).exists) return NextResponse.json({ error: "not found" }, { status: 404 });
  await ref.update({ ...p.data, updatedAt: new Date().toISOString() });
  await audit(a.uid!, "app.update", params.appId, p.data);
  return NextResponse.json({ ok: true });
}
