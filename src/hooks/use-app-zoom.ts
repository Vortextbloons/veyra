import { useCallback, useEffect, useState } from "react";

const ZOOM_MIN = 0.7;
const ZOOM_MAX = 1.6;
const ZOOM_STEP = 0.1;
const ZOOM_STORAGE_KEY = "veyra.zoom";
const DEFAULT_ZOOM = 1.1;

function clampZoom(z: number) {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
}

function loadZoom(): number {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) return DEFAULT_ZOOM;
    const parsed = parseFloat(raw);
    if (!Number.isFinite(parsed)) return DEFAULT_ZOOM;
    if (parsed === 1) return DEFAULT_ZOOM;
    return clampZoom(parsed);
  } catch {
    return DEFAULT_ZOOM;
  }
}

function applyZoom(zoom: number) {
  const z = String(zoom);
  document.documentElement.style.zoom = z;
  document.body.style.zoom = z;
  document.documentElement.style.setProperty("--ui-zoom", z);
}

export function useAppZoom() {
  const [zoom, setZoom] = useState<number>(loadZoom);

  useEffect(() => {
    applyZoom(zoom);
    try {
      localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
    } catch {
      // storage full or unavailable
    }
  }, [zoom]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key;
      if (key === "+" || key === "=") {
        e.preventDefault();
        setZoom((z) => clampZoom(+(z + ZOOM_STEP).toFixed(2)));
      } else if (key === "-" || key === "_") {
        e.preventDefault();
        setZoom((z) => clampZoom(+(z - ZOOM_STEP).toFixed(2)));
      } else if (key === "0") {
        e.preventDefault();
        setZoom(DEFAULT_ZOOM);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const zoomIn = useCallback(
    () => setZoom((z) => clampZoom(+(z + ZOOM_STEP).toFixed(2))),
    [],
  );
  const zoomOut = useCallback(
    () => setZoom((z) => clampZoom(+(z - ZOOM_STEP).toFixed(2))),
    [],
  );
  const zoomReset = useCallback(() => setZoom(DEFAULT_ZOOM), []);

  return { zoom, zoomIn, zoomOut, zoomReset };
}
