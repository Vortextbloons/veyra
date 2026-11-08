/** Update policy. Transport and installation live in app-update.ts and app_update.rs. */
export const UPDATE_CONFIG = {
  repository: "Vortextbloons/veyra",
  startupDelayMs: 8_000,
  downloadAfterAutomaticCheck: true,
} as const;
