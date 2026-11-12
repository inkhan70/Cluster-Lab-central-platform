// Initial registry entries only. packageId is null until verified by the owner.
export const SEED_APPS = [
  { appId: "quickshare", name: "QuickShare" },
  { appId: "freedomwallet", name: "FreedomWallet" },
  { appId: "nexusmind-ai", name: "NexusMind AI" },
  { appId: "connectlocal", name: "ConnectLocal Marketplace" },
].map((a) => ({ ...a, platform: "both" as const, packageId: null }));
