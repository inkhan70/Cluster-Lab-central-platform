import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { can, Role } from "./schemas";

function app(): App {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
  }) });
}
export const db = () => getFirestore(app());

/** Verifies the Firebase ID token AND the server-side role in admins/{uid}. */
export async function requireAdmin(req: Request, perm: string) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return { error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  try {
    const decoded = await getAuth(app()).verifyIdToken(token);
    const snap = await db().doc(`admins/${decoded.uid}`).get();
    const role = snap.data()?.role as Role | undefined;
    if (!can(role, perm)) return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    return { uid: decoded.uid, email: decoded.email ?? null, role };
  } catch {
    return { error: NextResponse.json({ error: "invalid token" }, { status: 401 }) };
  }
}
export const audit = (actor: string, action: string, appId: string | null, detail: object = {}) =>
  db().collection("auditLogs").add({ actor, action, appId, detail, at: new Date().toISOString() });
