import { describe, expect, it } from "vitest";
import { resolveComposerAction } from "@/modules/chat/composer-action";

const base = {
  busy: false,
  stopAvailable: true,
  steerAvailable: true,
  editMode: false,
  sendingSteer: false,
  hasText: false,
};

describe("composer primary action", () => {
  it("sends when idle", () => {
    expect(resolveComposerAction({ ...base, hasText: true })).toBe("send");
  });

  it("stops a running response when the composer is empty", () => {
    expect(resolveComposerAction({ ...base, busy: true })).toBe("stop");
  });

  it("steers a running response when there is text to send", () => {
    expect(resolveComposerAction({ ...base, busy: true, hasText: true })).toBe("steer");
  });

  it("offers stop when steering is unavailable", () => {
    expect(resolveComposerAction({ ...base, busy: true, steerAvailable: false, hasText: true })).toBe("stop");
  });

  it("falls back to a busy indicator when nothing can be cancelled", () => {
    expect(resolveComposerAction({ ...base, busy: true, stopAvailable: false })).toBe("busy");
  });

  it("keeps saving an edit even while a response runs", () => {
    expect(resolveComposerAction({ ...base, busy: true, editMode: true, hasText: true })).toBe("save-edit");
  });

  it("shows steer progress instead of stop while a steer is in flight", () => {
    expect(resolveComposerAction({ ...base, busy: true, sendingSteer: true, hasText: true })).toBe("steer");
  });
});
