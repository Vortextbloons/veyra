import { describe, expect, it } from "vitest";
import { modelAccessOf, modelInvocablePatch } from "./model-access";

describe("model access control mapping", () => {
  it("reads an absent override as following the default", () => {
    expect(modelAccessOf({})).toBe("default");
    expect(modelAccessOf({ modelInvocable: undefined })).toBe("default");
  });

  it("reads an explicit true as the model may use it", () => {
    expect(modelAccessOf({ modelInvocable: true })).toBe("auto");
  });

  it("reads an explicit false as manual only", () => {
    expect(modelAccessOf({ modelInvocable: false })).toBe("manual");
  });

  it("stores explicit choices and clears the override on reset", () => {
    expect(modelInvocablePatch("auto")).toEqual({ modelInvocable: true });
    expect(modelInvocablePatch("manual")).toEqual({ modelInvocable: false });
    // Reset must remove the key rather than pinning false, so the Skill keeps
    // following the library default when that default changes.
    expect(modelInvocablePatch("default")).toEqual({ modelInvocable: undefined });
  });

  it("round-trips every choice", () => {
    for (const access of ["auto", "manual", "default"] as const) {
      expect(modelAccessOf(modelInvocablePatch(access))).toBe(access);
    }
  });
});
