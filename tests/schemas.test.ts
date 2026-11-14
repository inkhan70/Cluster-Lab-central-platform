import { describe, expect, it } from "vitest";
import { appCreate, appPatch, can, normalizeRole } from "../lib/schemas";
import { SEED_APPS } from "../lib/seed";
describe("schemas", () => {
  it("accepts every seed app with unverified package id", () => SEED_APPS.forEach((a) => expect(appCreate.safeParse(a).success).toBe(true)));
  it("rejects bad app ids", () => expect(appCreate.safeParse({ appId: "../x", name: "x", platform: "web" }).success).toBe(false));
  it("rejects unknown patch fields", () => expect(appPatch.safeParse({ role: "owner" }).success).toBe(false));
  it("enforces roles", () => { expect(can("viewer", "apps:write")).toBe(false); expect(can("admin", "apps:write")).toBe(true); expect(can(undefined, "apps:read")).toBe(false); });
  it("normalizes roles", () => { expect(normalizeRole(" Owner ")).toBe("owner"); expect(normalizeRole("root")).toBeUndefined(); expect(normalizeRole(undefined)).toBeUndefined(); });
});
