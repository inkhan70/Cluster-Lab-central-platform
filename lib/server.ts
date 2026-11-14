import { App, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { can, normalizeRole } from "./schemas";

const FIREBASE_PROJECT_ID = "cluster-lab-central-flatform";

type ServiceAccountJson = {
  project_id?: string;
  client_email?: string;
  private_key?: string;
};

function missingAdminEnv() {
  const credential = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!credential) return ["FIREBASE_PRIVATE_KEY"];
  if (credential.startsWith("{")) return [];
  return process.env.FIREBASE_CLIENT_EMAIL ? [] : ["FIREBASE_CLIENT_EMAIL"];
}

function adminCredential() {
  const credential = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!credential) throw new Error("Firebase Admin: FIREBASE_PRIVATE_KEY is missing.");

  if (credential.startsWith("{")) {
    let serviceAccount: ServiceAccountJson;
    try {
      serviceAccount = JSON.parse(credential) as ServiceAccountJson;
    } catch {
      throw new Error("Firebase Admin: FIREBASE_PRIVATE_KEY must be valid service-account JSON.");
    }
    if (serviceAccount.project_id !== FIREBASE_PROJECT_ID) {
      throw new Error(`Firebase Admin: the service-account JSON must belong to ${FIREBASE_PROJECT_ID}.`);
    }
    if (!serviceAccount.client_email || !serviceAccount.private_key) {
      throw new Error("Firebase Admin: the service-account JSON must include client_email and private_key.");
    }
    return cert({
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key.replace(/\\n/g, "\n"),
    });
  }

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  if (!clientEmail) throw new Error("Firebase Admin: FIREBASE_CLIENT_EMAIL is missing for a raw PEM key.");
  return cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail,
    privateKey: credential.replace(/\\n/g, "\n"),
  });
}

function app(): App {
  if (getApps().length) return getApps()[0];
  const missing = missingAdminEnv();
  if (missing.length) throw new Error(`Missing Firebase Admin settings: ${missing.join(", ")}`);
  return initializeApp({ credential: adminCredential() });
}
export const db = () => getFirestore(app());

/** Verifies the Firebase ID token AND the server-side role in admins/{uid}. */
export async function requireAdmin(req: Request, perm: string) {
  const token = req.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return { error: NextResponse.json({ error: "Sign in is required." }, { status: 401 }) };

  const missing = missingAdminEnv();
  if (missing.length) {
    return { error: NextResponse.json({ error: `Server Firebase Admin setup is incomplete. Add: ${missing.join(", ")}.` }, { status: 503 }) };
  }

  let firebaseApp: App;
  try {
    firebaseApp = app();
  } catch (error) {
    const message = error instanceof Error && error.message.startsWith("Firebase Admin:")
      ? error.message
      : "Firebase Admin credentials could not initialize. Check the service-account values in the project environment.";
    return { error: NextResponse.json({ error: message }, { status: 503 }) };
  }

  let decoded;
  try {
    decoded = await getAuth(firebaseApp).verifyIdToken(token);
  } catch {
    return { error: NextResponse.json({ error: "Firebase rejected this ID token. Sign out and sign in again; if it continues, verify the server service account belongs to the same Firebase project." }, { status: 401 }) };
  }

  try {
    const ref = db().doc(`admins/${decoded.uid}`);
    let snap = await ref.get();
    // First-owner bootstrap: only the UID in the server-only env var can self-create the owner record.
    const bootstrap = process.env.BOOTSTRAP_OWNER_UID?.trim();
    if (!snap.exists && bootstrap && bootstrap === decoded.uid) {
      await ref.create({ role: "owner", email: decoded.email ?? null, bootstrapped: true, createdAt: new Date().toISOString() });
      await audit(decoded.uid, "admin.bootstrap_owner", null, {});
      snap = await ref.get();
    }
    const role = normalizeRole(snap.data()?.role);
    if (!snap.exists || !role) {
      // The UID is the caller's own, so showing it helps them create the right document.
      const why = !snap.exists ? `no document at admins/${decoded.uid}` : `document admins/${decoded.uid} has no valid "role" (owner, admin or viewer)`;
      return { error: NextResponse.json({ error: `Signed in, but ${why}.` }, { status: 403 }) };
    }
    if (!can(role, perm)) return { error: NextResponse.json({ error: `Your role (${role}) does not have permission for this action.` }, { status: 403 }) };
    return { uid: decoded.uid, email: decoded.email ?? null, role };
  } catch (error) {
    // Full detail goes to server logs only (Vercel > Logs); the client gets a generic hint.
    const code = (error as { code?: number | string })?.code;
    console.error("Firestore role read failed", { code, message: (error as Error)?.message });
    const hint =
      code === 5 || code === "5" ? "Firestore database (default) was not found. Create it in the Firebase console."
      : code === 7 || code === "7" ? "The service account lacks Firestore permission (needs Cloud Datastore User)."
      : code === 16 || code === "16" ? "The service-account key was rejected. Generate a new key and update the Vercel variable."
      : "Check the Vercel function logs for the exact Firestore error.";
    return { error: NextResponse.json({ error: `Firebase Admin could not read Firestore roles. ${hint}` }, { status: 503 }) };
  }
}
export const audit = (actor: string, action: string, appId: string | null, detail: object = {}) =>
  db().collection("auditLogs").add({ actor, action, appId, detail, at: new Date().toISOString() });
