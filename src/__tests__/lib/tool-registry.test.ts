import { describe, expect, it } from "vitest";
import { buildProviderTools, INTERACTIVE_ANSWER_TOOL_NAME } from "@/lib/tool-registry";

describe("provider tool schemas", () => {
  it("keeps function parameter roots compatible with provider restrictions", () => {
    const tools = buildProviderTools({
      webSearchEnabled: true,
      codeExecutionEnabled: true,
      enhancedMode: true,
      interactiveAnswersEnabled: true,
      artifactsEnabled: true,
    });
    expect(tools.some((tool) => tool.function.name === INTERACTIVE_ANSWER_TOOL_NAME)).toBe(true);
    for (const tool of tools) {
      expect(tool.function.parameters.type).toBe("object");
      for (const keyword of ["oneOf", "anyOf", "allOf", "enum", "const", "not"]) {
        expect(tool.function.parameters).not.toHaveProperty(keyword);
      }
    }
  });
});
