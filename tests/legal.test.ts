import { describe, expect, it } from "vitest";
import { generateTemplate, hasReviewMarker, legalSave, legalState, legalVars, playChecklist, renderMarkdown } from "../lib/legal";

const v = legalVars.parse({ developerName: "Acme Labs", contactEmail: "help@example.com", effectiveDate: "2026-11-14" });
describe("templates", () => {
  it("fills app and developer names and leaves no raw placeholders", () => {
    for (const t of ["privacy", "terms"] as const) { const b = generateTemplate(t, "QuickShare", v); expect(b).toContain("QuickShare"); expect(b).toContain("Acme Labs"); expect(b).not.toContain("{{"); }
  });
  it("only mentions AdMob and voluntary support when flagged", () => {
    expect(generateTemplate("privacy", "A", v)).not.toContain("AdMob");
    expect(generateTemplate("privacy", "A", { ...v, usesAds: true })).toContain("AdMob");
    expect(generateTemplate("terms", "A", v)).not.toContain("Voluntary support");
    expect(generateTemplate("terms", "A", { ...v, acceptsSupport: true })).toContain("does not unlock features");
  });
  it("blocks publishing while review notes remain", () => {
    expect(hasReviewMarker(generateTemplate("privacy", "A", { ...v, usesAccounts: true }))).toBe(true);
    expect(hasReviewMarker(generateTemplate("privacy", "A", v))).toBe(false);
    expect(hasReviewMarker(generateTemplate("privacy", "A", { ...v, targetsChildren: true }))).toBe(true);
  });
});
describe("rendering and validation", () => {
  it("escapes HTML and rejects unsafe link schemes", () => {
    const h = renderMarkdown('<script>alert(1)</script> [x](javascript:alert(1)) [ok](https://example.com)');
    expect(h).not.toContain("<script>"); expect(h).not.toContain('href="javascript'); expect(h).toContain('href="https://example.com"');
  });
  it("renders headings and lists", () => expect(renderMarkdown("# T\n\n- a\n- b")).toBe("<h1>T</h1>\n<ul><li>a</li><li>b</li></ul>"));
  it("rejects bad emails, dates and unknown fields", () => {
    expect(legalVars.safeParse({ ...v, contactEmail: "nope" }).success).toBe(false);
    expect(legalVars.safeParse({ ...v, effectiveDate: "14/11/2026" }).success).toBe(false);
    expect(legalSave.safeParse({ vars: v, body: "x", extra: 1 }).success).toBe(false);
  });
});
describe("state and Play checklist", () => {
  it("derives state", () => { expect(legalState(null)).toBe("missing"); expect(legalState({ body: "a" })).toBe("draft"); expect(legalState({ body: "a", publishedBody: "a" })).toBe("published"); expect(legalState({ body: "b", publishedBody: "a" })).toBe("changed"); });
  it("flags missing deletion URL and keeps the manual Data safety item open", () => {
    const c = playChecklist({ state: "published", body: "ok", vars: { ...v, usesAccounts: true }, publicUrl: "https://x/legal/a/privacy" });
    expect(c.find((i) => i.id === "deletion")!.ok).toBe(false);
    expect(c.find((i) => i.id === "safety")!.ok).toBe(false);
    expect(playChecklist({ state: "draft", body: "ok", vars: v, publicUrl: "u" }).find((i) => i.id === "published")!.ok).toBe(false);
  });
});
