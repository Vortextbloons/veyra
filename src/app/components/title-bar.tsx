import { lazy, Suspense } from "react";

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

export function TitleBar() {
  return (
    <div className="flex h-9 shrink-0 items-center justify-between bg-[var(--color-bg)] px-4">
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
    </div>
  );
}
