import { describe, expect, it } from "vitest";
import {
  isPopoverOnScreen,
  placePopoverAbove,
  POPOVER_VIEWPORT_PAD,
} from "@/modules/permissions/components/popover-placement";

const VIEWPORT = { width: 1280, height: 800 };

describe("composer popover placement", () => {
  it("opens above the trigger and fully inside the viewport", () => {
    const placement = placePopoverAbove({ right: 640, top: 700 }, VIEWPORT, 300);
    expect(isPopoverOnScreen(placement, VIEWPORT)).toBe(true);
    expect(placement.width).toBe(300);
    expect(placement.bottom).toBe(800 - 700 + 8);
  });

  it("keeps a trigger near the right edge on screen", () => {
    // This is the case that clipped: a control at the window's right edge.
    const placement = placePopoverAbove({ right: 1276, top: 700 }, VIEWPORT, 300);
    expect(isPopoverOnScreen(placement, VIEWPORT)).toBe(true);
    expect(placement.left + placement.width).toBeLessThanOrEqual(VIEWPORT.width - POPOVER_VIEWPORT_PAD);
  });

  it("keeps a trigger past the right edge on screen", () => {
    const placement = placePopoverAbove({ right: 1400, top: 700 }, VIEWPORT, 300);
    expect(isPopoverOnScreen(placement, VIEWPORT)).toBe(true);
  });

  it("keeps a trigger at the left edge on screen", () => {
    const placement = placePopoverAbove({ right: 40, top: 700 }, VIEWPORT, 300);
    expect(isPopoverOnScreen(placement, VIEWPORT)).toBe(true);
    expect(placement.left).toBe(POPOVER_VIEWPORT_PAD);
  });

  it("shrinks the box instead of spilling when the window is narrow", () => {
    const narrow = { width: 260, height: 800 };
    const placement = placePopoverAbove({ right: 240, top: 700 }, narrow, 300);
    expect(placement.width).toBe(narrow.width - POPOVER_VIEWPORT_PAD * 2);
    expect(isPopoverOnScreen(placement, narrow)).toBe(true);
  });

  it("limits height when the window is short, rather than going off the top", () => {
    const short = { width: 1280, height: 300 };
    const placement = placePopoverAbove({ right: 640, top: 280 }, short, 300);
    // The box sits just above the trigger, so its available height is small.
    expect(placement.maxHeight).toBeLessThanOrEqual(short.height);
    expect(placement.maxHeight).toBeGreaterThan(0);
  });

  it("never produces a negative width in a tiny viewport", () => {
    const tiny = { width: 10, height: 200 };
    const placement = placePopoverAbove({ right: 8, top: 180 }, tiny, 300);
    expect(placement.width).toBeGreaterThanOrEqual(0);
    expect(placement.maxHeight).toBeGreaterThan(0);
  });
});
