import { z } from "zod";
export const ROLES = ["owner", "admin", "viewer"] as const;
export type Role = (typeof ROLES)[number];
export const PERMISSIONS: Record<Role, string[]> = {
  owner: ["apps:read", "apps:write", "audit:read"],
  admin: ["apps:read", "apps:write"],
  viewer: ["apps:read"],
};
export const can = (role: Role | undefined, perm: string) => !!role && PERMISSIONS[role]?.includes(perm);
export const appId = z.string().regex(/^[a-z0-9][a-z0-9-]{1,38}$/);
export const appCreate = z.object({
  appId, name: z.string().min(1).max(80),
  platform: z.enum(["android", "web", "both"]),
  packageId: z.string().regex(/^[a-zA-Z][\w]*(\.[a-zA-Z][\w]*)+$/).nullable().default(null),
});
export const appPatch = z.object({
  name: z.string().min(1).max(80).optional(),
  enabled: z.boolean().optional(),
  privacyPolicyUrl: z.string().url().nullable().optional(),
  supportEnabled: z.boolean().optional(),
}).strict();

/** Tolerates "Owner", " owner " etc.; returns undefined for anything that is not a known role. */
export const normalizeRole = (v: unknown): Role | undefined => {
  const r = typeof v === "string" ? v.trim().toLowerCase() : "";
  return (ROLES as readonly string[]).includes(r) ? (r as Role) : undefined;
};
