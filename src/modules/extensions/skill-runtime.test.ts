import { describe, expect, it } from "vitest";
import { draftToSkill, missingRequiredCapabilities } from "./skill-runtime";
import type { McpServerRecord } from "./extension-types";

const source = "# Release notes\n\nWrite concise release notes.";

describe("Skill package runtime", () => {
  it("retains a reviewed manifest identity and workflow", async () => {
    const skill = await draftToSkill({
      name: "ignored", description: "", source, provenance: "local",
      packageManifest: JSON.stringify({ id: "skill.release-notes", version: "2.0.0", workflows: [{ id: "brief", name: "Brief", instructions: "Use three bullets." }], requiredCapabilities: ["mcp.github.create_issue"] }),
    });
    expect(skill.id).toBe("skill.release-notes");
    expect(skill.version).toBe("2.0.0");
    expect(skill.workflows).toEqual([{ id: "brief", name: "Brief", instructions: "Use three bullets." }]);
    expect(skill.requestedCapabilities).toEqual(["mcp.github.create_issue"]);
  });

  it("blocks a required capability that is unavailable in the selected project", async () => {
    const skill = await draftToSkill({ name: "ignored", description: "", source, provenance: "local", packageManifest: JSON.stringify({ requiredCapabilities: ["mcp.github.create_issue"] }) });
    const server: McpServerRecord = { id: "github", type: "mcp_server", name: "GitHub", description: "", version: "1", enabled: true, provenance: "manual", installedAt: "", updatedAt: "", health: "ready", transport: "stdio", executable: "server", timeoutMs: 30_000, projectIds: ["project-a"], capabilityCount: { tools: 1, resources: 0, prompts: 0 }, capabilities: { tools: [{ name: "create_issue" }], resources: [], prompts: [] } };
    expect(missingRequiredCapabilities(skill, [server], "project-a")).toEqual([]);
    expect(missingRequiredCapabilities(skill, [server], "project-b")).toEqual(["mcp.github.create_issue"]);
  });

  it("rejects manifest file references outside the reviewed package", async () => {
    await expect(draftToSkill({ name: "ignored", description: "", source, provenance: "local", packageFiles: ["SKILL.md"], packageManifest: JSON.stringify({ prompts: ["prompts/missing.md"] }) })).rejects.toThrow("not in the imported package");
  });
});
