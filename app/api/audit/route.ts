import { NextResponse } from "next/server";
import { db, requireAdmin } from "@/lib/server";
export async function GET(req: Request) {
  const a = await requireAdmin(req, "audit:read");
  if (a.error) return a.error;
  const s = await db().collection("auditLogs").orderBy("at", "desc").limit(100).get();
  return NextResponse.json({ logs: s.docs.map((d) => ({ id: d.id, ...d.data() })) });
}
