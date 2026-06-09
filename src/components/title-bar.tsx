import { lazy, Suspense, useMemo } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Minus, Square, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

const SchedulerPopover = lazy(() =>
  import("@/components/scheduler/scheduler-popover").then((module) => ({
    default: module.SchedulerPopover,
  })),
);

const ConnectivityPopover = lazy(() =>
  import("@/components/connectivity/connectivity-popover").then((module) => ({
    default: module.ConnectivityPopover,
  })),
);

type TitleBarProps = {
  zoom?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onZoomReset?: () => void;
};

export function TitleBar({
  zoom = 1,
  onZoomIn,
  onZoomOut,
  onZoomReset,
}: TitleBarProps) {
  const showZoom = zoom !== 1;
  const appWindow = useMemo(() => getCurrentWindow(), []);

  return (
    <div
      className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4"
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Close"
          onClick={() => void appWindow.close()}
          className="grid size-3 place-items-center rounded-full bg-[#ff5f57] hover:brightness-110"
        >
          <X className="size-2 text-black/60 opacity-0 hover:opacity-100" />
        </button>
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => void appWindow.minimize()}
          className="grid size-3 place-items-center rounded-full bg-[#febc2e] hover:brightness-110"
        >
          <Minus className="size-2 text-black/60 opacity-0 hover:opacity-100" />
        </button>
        <button
          type="button"
          aria-label="Maximize"
          onClick={() => void appWindow.toggleMaximize()}
          className="grid size-3 place-items-center rounded-full bg-[#28c840] hover:brightness-110"
        >
          <Square className="size-1.5 text-black/60 opacity-0 hover:opacity-100" />
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center gap-2 self-stretch">
        <Suspense fallback={<span className="size-5" aria-hidden="true" />}>
          <ConnectivityPopover />
        </Suspense>
        <Suspense fallback={<span className="size-5" aria-hidden="true" />}>
          <SchedulerPopover />
        </Suspense>
        <span
          data-tauri-drag-region
          className="text-[12px] text-[var(--color-text-dim)]"
        >
          Veyra
        </span>
      </div>

      <div className="flex w-12 items-center justify-end gap-1">
        {showZoom && (
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={onZoomOut}
              className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              <ZoomOut className="size-3" />
            </button>
            <button
              type="button"
              aria-label="Reset zoom"
              onClick={onZoomReset}
              className="rounded px-1 font-mono text-[10px] tabular-nums text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              {Math.round(zoom * 100)}%
              <RotateCcw className="ml-1 inline size-2.5 opacity-60" />
            </button>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={onZoomIn}
              className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              <ZoomIn className="size-3" />
            </button>
          </div>
        )}
        {!showZoom && (
          <button
            type="button"
            aria-label="Zoom in"
            onClick={onZoomIn}
            className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            <ZoomIn className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
