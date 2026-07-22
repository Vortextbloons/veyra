import { describe, expect, it } from "vitest";
import { buildCapabilityCatalog, classifyMcpTool } from "./capability-catalog";

describe("capability catalog", () => {
  it("defaults untrusted MCP tools to external writes", () => expect(classifyMcpTool({ name: "lookup" })).toBe("external_write"));
  it("namespaces resource identities", () => {
    const catalog = buildCapabilityCatalog([{ id: "github", type: "mcp_server", name: "GitHub", description: "", version: "1", enabled: true, provenance: "manual", installedAt: "", updatedAt: "", health: "ready", transport: "streamable_http", timeoutMs: 1, projectIds: [], capabilityCount: { tools: 0, resources: 1, prompts: 0 }, capabilities: { tools: [], prompts: [], resources: [{ uri: "file:///notes one" }] } }], []);
    expect(catalog[0]).toMatchObject({ id: "mcp.github.resource.file%3A%2F%2F%2Fnotes%20one", kind: "resource" });
  });
});
