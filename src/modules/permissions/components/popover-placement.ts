/**
 * Viewport placement for a composer popover.
 *
 * These popovers are rendered in a portal and positioned from measured
 * coordinates. Absolute positioning inside the composer let a control near the
 * right edge push its panel past the window, clipping the rows inside it.
 */

export const POPOVER_VIEWPORT_PAD = 12;
export const POPOVER_GAP = 8;

export type PopoverPlacement = {
  /** Fixed-position left edge, clamped inside the viewport. */
  left: number;
  /** Fixed-position bottom edge, measured up from the trigger. */
  bottom: number;
  /** Usable width, never wider than the viewport. */
  width: number;
  /** Usable height before it must scroll. */
  maxHeight: number;
};

/**
 * Places a popover above `trigger`, right-aligned to it, fully inside the
 * viewport.
 *
 * Right-aligning means the panel grows leftward from the control, which is what
 * keeps a trigger sitting near the window edge from producing an off-screen
 * panel. The result is then clamped on both sides, and the width shrinks rather
 * than spilling when the viewport is narrower than the preferred width.
 */
export function placePopoverAbove(
  trigger: { right: number; top: number },
  viewport: { width: number; height: number },
  preferredWidth: number,
  gap: number = POPOVER_GAP,
  pad: number = POPOVER_VIEWPORT_PAD,
): PopoverPlacement {
  // Never wider than the viewport allows; a tiny viewport still gets a real box.
  const width = Math.max(0, Math.min(preferredWidth, viewport.width - pad * 2));
  const bottom = viewport.height - trigger.top + gap;
  const maxHeight = Math.max(120, viewport.height - bottom - pad);
  const left = Math.max(
    pad,
    Math.min(trigger.right - width, viewport.width - width - pad),
  );

  return { left, bottom, width, maxHeight };
}

/** Whether a placement keeps the whole box on screen. */
export function isPopoverOnScreen(
  placement: { left: number; width: number; bottom: number; maxHeight: number },
  viewport: { width: number; height: number },
  pad: number = POPOVER_VIEWPORT_PAD,
): boolean {
  return (
    placement.left >= pad - 0.5 &&
    placement.left + placement.width <= viewport.width - pad + 0.5 &&
    placement.bottom <= viewport.height &&
    placement.maxHeight > 0
  );
}
