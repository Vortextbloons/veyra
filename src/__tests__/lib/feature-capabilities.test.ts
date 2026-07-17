import { describe, expect, it } from "vitest";
import { isFeatureAvailable } from "@/lib/connectivity/feature-capabilities";

describe("feature capabilities", () => {
  it("keeps code execution unavailable even when local services are connected", () => {
    expect(isFeatureAvailable("codeExecution", "online", true)).toEqual({
      available: false,
      reason: "Native code execution is disabled until Veyra has an OS-enforced sandbox.",
    });
  });
});
