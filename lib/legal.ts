import { z } from "zod";

export const LEGAL_TYPES = ["privacy", "terms"] as const;
export type LegalType = (typeof LEGAL_TYPES)[number];
export const legalType = z.enum(LEGAL_TYPES);
export const LEGAL_LABEL: Record<LegalType, string> = { privacy: "Privacy policy", terms: "Terms of use" };

const optionalUrl = z.union([z.literal(""), z.string().trim().url().max(300)]).default("");
const flag = z.boolean().default(false);
export const legalVars = z.object({
  developerName: z.string().trim().min(1, "Developer name is required").max(120),
  contactEmail: z.string().trim().email("A valid contact email is required").max(200),
  website: optionalUrl,
  accountDeletionUrl: optionalUrl,
  governingLaw: z.string().trim().max(120).default(""),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use the format YYYY-MM-DD"),
  usesAccounts: flag, userContent: flag, usesAnalytics: flag, usesAds: flag,
  collectsLocation: flag, acceptsSupport: flag, targetsChildren: flag,
});
export type LegalVars = z.infer<typeof legalVars>;
export const legalSave = z.object({ vars: legalVars, body: z.string().max(60000) }).strict();
export const zodMessage = (e: z.ZodError) => "Invalid input: " + e.issues.map((i) => `${i.path.join(".") || "request"} ${i.message}`).join("; ");

export type LegalState = "missing" | "draft" | "published" | "changed";
export const STATE_TEXT: Record<LegalState, string> = { missing: "Not started", draft: "Draft", published: "Published", changed: "Unpublished edits" };
export const legalState = (d: { body?: string; publishedBody?: string | null } | null | undefined): LegalState =>
  !d ? "missing" : !d.publishedBody ? "draft" : d.body === d.publishedBody ? "published" : "changed";

/** Placeholders the owner must resolve; publishing is blocked while any remain. */
export const hasReviewMarker = (body: string) => body.includes("[REVIEW");
export const siteUrl = (req: Request) => (process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") || new URL(req.url).origin);
export const publicPath = (appId: string, type: LegalType) => `/legal/${appId}/${type}`;

const bullets = (items: string[]) => items.map((i) => `- ${i}`).join("\n");
const contact = (v: LegalVars) => `Contact us at [${v.contactEmail}](mailto:${v.contactEmail})${v.website ? ` or visit [${v.website}](${v.website})` : ""}.`;

function privacy(app: string, v: LegalVars) {
  const collect = ["Information you send us directly, such as messages to support."];
  if (v.usesAccounts) collect.push("Account information, such as your email address or sign-in identifier, and settings tied to your account.");
  if (v.userContent) collect.push("Content you create or upload in the app.");
  if (v.collectsLocation) collect.push("Location information, only after you grant the location permission.");
  if (v.usesAnalytics) collect.push("Usage and device information, such as app interactions, crash reports, and device model, used to understand and improve the app.");
  if (v.usesAds) collect.push("Device and advertising identifiers and approximate location, collected by our advertising partner to show and measure ads.");
  const third: string[] = [];
  if (v.usesAds) third.push("Advertising: we use Google AdMob. See [Google's policy on how Google uses data](https://policies.google.com/technologies/partner-sites).");
  if (v.usesAnalytics) third.push("Analytics and crash reporting: we use third-party tools that process usage and device data on our behalf.");
  const out = [`# Privacy Policy for ${app}`, `Effective date: ${v.effectiveDate}`,
    `${app} is provided by ${v.developerName}. This policy explains what information the app handles and the choices you have.`,
    `## Information we collect`, bullets(collect),
    `## How we use information`, bullets(["To provide, maintain, and improve the app.", "To respond to your requests and support messages.", "To keep the app secure and prevent abuse.", ...(v.usesAds ? ["To show and measure advertising."] : [])])];
  if (third.length) out.push(`## Third-party services`, bullets(third), `[REVIEW: list each third-party SDK your app actually uses and delete anything that does not apply.]`);
  if (v.usesAccounts || v.userContent) out.push(`## Retention and deletion`, `We keep information only as long as needed for the purposes above. [REVIEW: state your real retention period.]`,
    v.usesAccounts ? (v.accountDeletionUrl ? `You can request deletion of your account and data at ${v.accountDeletionUrl}.` : `You can request deletion of your account and data by emailing ${v.contactEmail}.`) : `You can request deletion of your content by emailing ${v.contactEmail}.`);
  out.push(`## Children`, v.targetsChildren ? `[REVIEW: apps designed for children must meet additional requirements (for example COPPA and Google Play's Families Policy). Write this section with legal advice.]` : `${app} is not directed to children under 13, and we do not knowingly collect their personal information.`,
    `## Security`, `We use reasonable safeguards, but no method of transmission or storage is completely secure.`,
    `## Changes to this policy`, `We may update this policy and will change the effective date above when we do.`,
    `## Contact`, contact(v));
  return out.join("\n\n");
}

function terms(app: string, v: LegalVars) {
  const out = [`# Terms of Use for ${app}`, `Effective date: ${v.effectiveDate}`,
    `These terms govern your use of ${app}, provided by ${v.developerName}. By using the app you agree to them.`,
    `## Using the app`, bullets(["Use the app lawfully and do not misuse or interfere with it.", "Do not attempt to reverse engineer, disrupt, or gain unauthorized access to the app or its services."])];
  if (v.usesAccounts) out.push(`## Accounts`, `You are responsible for your account and for keeping your sign-in details secure.`);
  if (v.userContent) out.push(`## Your content`, `You keep ownership of content you create. You give us the limited permission needed to store and display it to operate the app. You are responsible for the content you submit.`);
  if (v.usesAds) out.push(`## Advertising`, `The app may display ads provided by third parties. We are not responsible for third-party ad content.`);
  if (v.acceptsSupport) out.push(`## Voluntary support`, `Any support or contribution is optional. It does not unlock features, and the core features of the app remain available without it.`);
  out.push(`## Disclaimer`, `The app is provided "as is" without warranties of any kind, to the extent permitted by law.`,
    `## Limitation of liability`, `To the extent permitted by law, ${v.developerName} is not liable for indirect or consequential damages arising from your use of the app.`,
    `## Termination`, `We may suspend or end access to the app if these terms are violated. You may stop using the app at any time.`,
    `## Changes`, `We may update these terms and will change the effective date above when we do.`);
  if (v.governingLaw) out.push(`## Governing law`, `These terms are governed by the laws of ${v.governingLaw}.`);
  out.push(`## Contact`, contact(v));
  return out.join("\n\n");
}
export const generateTemplate = (type: LegalType, appName: string, v: LegalVars) => (type === "privacy" ? privacy(appName, v) : terms(appName, v));

export type CheckItem = { id: string; label: string; ok: boolean; hint: string; manual?: boolean };
/** Google Play Console privacy-policy readiness. Manual items can only be confirmed by a person. */
export function playChecklist(i: { state: LegalState; body: string; vars: Partial<LegalVars>; publicUrl: string }): CheckItem[] {
  const published = i.state === "published" || i.state === "changed";
  return [
    { id: "published", ok: published, label: "Policy is published", hint: "Play Console needs a live, public URL. Publish the policy first." },
    { id: "current", ok: i.state === "published", label: "Published text matches your latest edits", hint: "Publish again so the public page shows your latest text." },
    { id: "review", ok: !!i.body && !hasReviewMarker(i.body), label: "No [REVIEW] placeholders remain", hint: "Replace or delete every [REVIEW: …] note." },
    { id: "email", ok: !!i.vars.contactEmail, label: "Contact email is set", hint: "Play Console requires a developer contact email." },
    { id: "deletion", ok: !i.vars.usesAccounts || !!i.vars.accountDeletionUrl, label: "Account deletion URL (apps with accounts)", hint: "Apps with accounts need a public account-deletion page; add its URL." },
    { id: "url", ok: published, label: `Paste this URL into Play Console: ${i.publicUrl}`, hint: "Available after publishing. No sign-in is required to open it." },
    { id: "safety", ok: false, manual: true, label: "Policy matches your Data safety form", hint: "Confirm every SDK and data type you declare in Play Console is described here." },
  ];
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g, (_m, t: string, u: string) => `<a href="${u}" rel="noopener noreferrer">${t}</a>`);
/** Small markdown subset (headings, lists, bold, http/https/mailto links). All input is HTML-escaped first. */
export function renderMarkdown(src: string): string {
  const out: string[] = []; let para: string[] = []; let list: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    if (list.length) out.push(`<ul>${list.map((x) => `<li>${inline(x)}</li>`).join("")}</ul>`);
    para = []; list = [];
  };
  for (const raw of src.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd(); let m: RegExpExecArray | null;
    if (!line.trim()) { flush(); continue; }
    if ((m = /^(#{1,3})\s+(.*)$/.exec(line))) { flush(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if ((m = /^[-*]\s+(.*)$/.exec(line))) { if (para.length) flush(); list.push(m[1]); continue; }
    if (list.length) flush();
    para.push(line.trim());
  }
  flush();
  return out.join("\n");
}
