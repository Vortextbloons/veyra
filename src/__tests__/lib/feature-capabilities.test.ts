import { describe, expect, it } from "vitest";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";

describe("feature capabilities", () => {
  it("makes code execution available when its requirement is met", () => {
    expect(isFeatureAvailable("codeExecution", "online", true)).toEqual({
      available: true,
    });
  });
});
