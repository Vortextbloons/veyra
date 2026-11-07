/**
 * App-wide UI scale.
 *
 * Scaling is delegated to the platform webview (WebView2 `ZoomFactor`) rather
 * than CSS `zoom`. Native zoom scales the layout viewport itself, so viewport
 * units, fixed/sticky overlays, scroll containers, pointer hit-testing and
 * media queries all stay correct at every level.
 *
 * The previous implementation set `zoom` on `<html>` and then tried to fight it
 * with `#root { width: calc(100vw / zoom) }`. CSS `zoom` multiplies already
 * computed layout while `vw`/`vh` keep resolving against the real viewport, so
 * the compensation never fully lined up: the UI was clipped on first paint
 * (the effect that applied zoom ran after render), the root box lagged behind
 * the viewport, and zooming out left unused space.
 */

import { getCurrentWebview } from "@tauri-apps/api/webview";

export const UI_SCALE_MIN = 0.7;
export const UI_SCALE_MAX = 1.6;
export const UI_SCALE_DEFAULT = 1;

const UI_SCALE_STEP = 0.1;
const UI_SCALE_STORAGE_KEY = "veyra.uiScale";
/** Key written by the old CSS-zoom implementation. */
const LEGACY_ZOOM_STORAGE_KEY = "veyra.zoom";
/**
 * The old build shipped a 1.1 default and persisted it for every user, so a
 * stored 1.1 is almost always "never chose a scale" rather than a real choice.
 */
const LEGACY_IMPLICIT_DEFAULT = 1.1;
/** Wheel delta (px) that advances one zoom step. */
const WHEEL_STEP_THRESHOLD = 100;

let currentScale = UI_SCALE_DEFAULT;

function clampScale(scale: number): number {
  return Math.min(UI_SCALE_MAX, Math.max(UI_SCALE_MIN, scale));
}

function normalizeScale(scale: number): number {
  return Math.round(clampScale(scale) * 100) / 100;
}

function readStoredScale(): number {
  try {
    const stored = localStorage.getItem(UI_SCALE_STORAGE_KEY);
    if (stored !== null) {
      const parsed = Number.parseFloat(stored);
      return Number.isFinite(parsed) ? normalizeScale(parsed) : UI_SCALE_DEFAULT;
    }

    const legacy = Number.parseFloat(
      localStorage.getItem(LEGACY_ZOOM_STORAGE_KEY) ?? "",
    );
    if (!Number.isFinite(legacy)) return UI_SCALE_DEFAULT;
    return normalizeScale(
      legacy === LEGACY_IMPLICIT_DEFAULT ? UI_SCALE_DEFAULT : legacy,
    );
  } catch {
    return UI_SCALE_DEFAULT;
  }
}

function persistScale(scale: number): void {
  try {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, String(scale));
  } catch {
    // storage full or unavailable
  }
}

async function applyScale(scale: number): Promise<void> {
  currentScale = scale;
  try {
    await getCurrentWebview().setZoom(scale);
  } catch {
    // Browser-only preview (plain Vite server): there is no webview to scale.
  }
}

/** Current applied scale. Not reactive: scaling does not re-render React. */
export function getUiScale(): number {
  return currentScale;
}

export async function setUiScale(scale: number): Promise<void> {
  const next = normalizeScale(scale);
  if (next === currentScale) return;
  await applyScale(next);
  persistScale(next);
}

export function zoomUiIn(): Promise<void> {
  return setUiScale(currentScale + UI_SCALE_STEP);
}

export function zoomUiOut(): Promise<void> {
  return setUiScale(currentScale - UI_SCALE_STEP);
}

export function resetUiScale(): Promise<void> {
  return setUiScale(UI_SCALE_DEFAULT);
}

let initPromise: Promise<void> | null = null;

/**
 * Restore the persisted scale. Idempotent: the first caller performs the work,
 * later callers await the same promise.
 */
export function initUiScale(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const stored = readStoredScale();
      await applyScale(stored);
      persistScale(stored);
    })();
  }
  return initPromise;
}

/**
 * Call at startup so the webview zoom is requested before the first paint. The
 * window stays hidden until `emitAppReady`, which awaits this promise.
 */
export const uiScaleReady: Promise<void> = initUiScale();

/**
 * Ctrl/Cmd + `+`, `-`, `0` and Ctrl/Cmd + wheel. Ctrl+wheel is intercepted so
 * the webview's own browser zoom cannot stack on top of the app scale.
 */
export function installUiScaleShortcuts(): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!event.ctrlKey && !event.metaKey) return;

    switch (event.key) {
      case "+":
      case "=":
        event.preventDefault();
        void zoomUiIn();
        break;
      case "-":
      case "_":
        event.preventDefault();
        void zoomUiOut();
        break;
      case "0":
        event.preventDefault();
        void resetUiScale();
        break;
      default:
        break;
    }
  };

  let wheelDelta = 0;
  const onWheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();

    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    wheelDelta += delta;
    if (Math.abs(wheelDelta) < WHEEL_STEP_THRESHOLD) return;

    const direction = wheelDelta < 0 ? 1 : -1;
    wheelDelta = 0;
    void setUiScale(currentScale + direction * UI_SCALE_STEP);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("wheel", onWheel, { passive: false });

  return () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("wheel", onWheel);
  };
}
