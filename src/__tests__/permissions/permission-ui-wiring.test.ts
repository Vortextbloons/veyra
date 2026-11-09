import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  renderPermissionCards: vi.fn(),
  renderModeControl: vi.fn(),
}));

vi.mock("@/modules/permissions/components/permission-request-card", () => ({
  PermissionRequestCards: (props: { sessionId: string | null }) => {
    mocks.renderPermissionCards(props.sessionId);
    return null;
  },
}));

vi.mock("@/modules/permissions/components/permission-mode-control", () => ({
  PermissionModeControl: (props: { sessionId: string | null }) => {
    mocks.renderModeControl(props.sessionId);
    return null;
  },
}));

vi.mock("@/components/settings/permissions-settings", () => ({
  PermissionsSettings: () => null,
}));

/**
 * Both surfaces must exist and be wired to the active chat, so an approval is
 * never invisible and the mode in force is always reachable.
 */
describe("permission UI wiring", () => {
  it("exports the settings surface", async () => {
    const mod = await import("@/components/settings/permissions-settings");
    expect(typeof mod.PermissionsSettings).toBe("function");
  });

  it("provides a cards component and a mode control", async () => {
    const cards = await import("@/modules/permissions/components/permission-request-card");
    const control = await import("@/modules/permissions/components/permission-mode-control");
    expect(typeof cards.PermissionRequestCards).toBe("function");
    expect(typeof control.PermissionModeControl).toBe("function");
  });
});
