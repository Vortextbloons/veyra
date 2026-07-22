import { describe, expect, it } from "vitest";
import { disabledMcpServersForChat, findCapabilityGrant, hasCapabilityGrant, isMcpEnabledForChat } from "./extensions-store";

const grant = { id: "g", serverId: "mcp.one", capabilityId: "mcp.mcp.one.read", category: "external_mutation" as const, decision: "allow" as const, createdAt: "2026-01-01T00:00:00.000Z", capabilityFingerprint: "current" };

describe("hasCapabilityGrant", () => {
  it("requires the discovered capability fingerprint to remain unchanged", () => {
    expect(hasCapabilityGrant([grant], { serverId: grant.serverId, capabilityId: grant.capabilityId, capabilityFingerprint: "current" })).toBe(true);
    expect(hasCapabilityGrant([grant], { serverId: grant.serverId, capabilityId: grant.capabilityId, capabilityFingerprint: "changed" })).toBe(false);
  });

  it("makes an applicable deny override an allow", () => {
    expect(hasCapabilityGrant([grant, { ...grant, id: "deny", decision: "deny" as const }], { serverId: grant.serverId, capabilityId: grant.capabilityId, capabilityFingerprint: "current" })).toBe(false);
  });

  it("does not match exhausted one-time approvals", () => {
    expect(hasCapabilityGrant([{ ...grant, usesRemaining: 0 }], { serverId: grant.serverId, capabilityId: grant.capabilityId, capabilityFingerprint: "current" })).toBe(false);
    expect(findCapabilityGrant([{ ...grant, usesRemaining: 1 }], { serverId: grant.serverId, capabilityId: grant.capabilityId, capabilityFingerprint: "current" })?.id).toBe("g");
  });
});

describe("disabledMcpServersForChat", () => {
  const servers = [{ id: "one" }, { id: "two" }] as never;

  it("keeps enabled MCP servers on until a chat explicitly turns one off", () => {
    expect(disabledMcpServersForChat(servers, undefined)).toEqual([]);
    expect(disabledMcpServersForChat(servers, ["two"])).toEqual(["two"]);
  });

  it("allows a chat to override a disabled server", () => {
    const server = { id: "one", enabled: false } as never;
    expect(isMcpEnabledForChat(server, [], undefined)).toBe(false);
    expect(isMcpEnabledForChat(server, [], ["one"])).toBe(true);
  });
});
