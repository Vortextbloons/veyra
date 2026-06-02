import { Minus, Square, X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { SchedulerPopover } from "@/components/scheduler/scheduler-popover";

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
  return (
    <div
      data-tauri-drag-region
      className="flex h-9 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4"
    >
      <div className="flex items-center gap-2">
        <button
          aria-label="Close"
          className="grid size-3 place-items-center rounded-full bg-[#ff5f57] hover:brightness-110"
        >
          <X className="size-2 text-black/60 opacity-0 hover:opacity-100" />
        </button>
        <button
          aria-label="Minimize"
          className="grid size-3 place-items-center rounded-full bg-[#febc2e] hover:brightness-110"
        >
          <Minus className="size-2 text-black/60 opacity-0 hover:opacity-100" />
        </button>
        <button
          aria-label="Maximize"
          className="grid size-3 place-items-center rounded-full bg-[#28c840] hover:brightness-110"
        >
          <Square className="size-1.5 text-black/60 opacity-0 hover:opacity-100" />
        </button>
      </div>

      <div className="flex items-center gap-2">
        <SchedulerPopover />
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
              aria-label="Zoom out"
              onClick={onZoomOut}
              className="grid size-5 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              <ZoomOut className="size-3" />
            </button>
            <button
              aria-label="Reset zoom"
              onClick={onZoomReset}
              className="rounded px-1 font-mono text-[10px] tabular-nums text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            >
              {Math.round(zoom * 100)}%
              <RotateCcw className="ml-1 inline size-2.5 opacity-60" />
            </button>
            <button
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
