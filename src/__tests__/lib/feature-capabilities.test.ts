import { describe, expect, it } from "vitest";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";

describe("feature capabilities", () => {
  it("keeps native code execution disabled without an OS-enforced sandbox", () => {
    expect(isFeatureAvailable("codeExecution", "online", true)).toEqual({
      available: false,
      reason: "Code execution requires an OS-enforced sandbox and is currently disabled.",
    });
  });
});
