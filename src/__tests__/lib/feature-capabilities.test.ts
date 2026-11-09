import { describe, expect, it } from "vitest";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";

describe("feature capabilities", () => {
  it("allows sandboxed code execution online and offline", () => {
    expect(isFeatureAvailable("codeExecution", "online", true)).toEqual({
      available: true,
    });
    expect(isFeatureAvailable("codeExecution", "offline", false)).toEqual({ available: true });
  });
});
