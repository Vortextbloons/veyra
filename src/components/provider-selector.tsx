import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  Check,
  Server,
  Cloud,
} from "lucide-react";
import type { ProviderInfo } from "@/lib/chat-types";

type ProviderSelectorProps = {
  value: string;
  providers?: ProviderInfo[];
  onChange?: (id: string) => void;
};

export function ProviderSelector({
  value,
  providers = [],
  onChange,
}: ProviderSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = providers.find((p) => p.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px] transition-colors ${
          open
            ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
            : "border-[var(--color-border)] bg-[var(--color-panel)] text-white hover:border-[var(--color-border-strong)]"
        }`}
      >
        <div className="grid size-5 place-items-center rounded bg-violet-500/20 text-violet-300">
          {current?.icon === "cloud" ? (
            <Cloud className="size-3" />
          ) : (
            <Server className="size-3" />
          )}
        </div>
        <span className="max-w-[140px] truncate font-medium">
          {current?.name ?? "Provider"}
        </span>
        {current && (
          <span
            className={`size-1.5 rounded-full ${
              current.status === "connected"
                ? "bg-emerald-400"
                : "bg-red-400"
            }`}
          />
        )}
        <ChevronDown
          className={`size-3 text-[var(--color-text-dim)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl shadow-black/50"
        >
          <div className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Provider
          </div>
          <div className="space-y-0.5 p-1">
            {providers.map((p) => {
              const active = p.id === value;
              return (
                <div
                  key={p.id}
                  role="option"
                  aria-selected={active}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                    active
                      ? "bg-[var(--color-accent-soft)]"
                      : "hover:bg-white/[0.04]"
                  }`}
                  onClick={() => {
                    onChange?.(p.id);
                    setOpen(false);
                  }}
                >
                  <div
                    className={`grid size-6 shrink-0 place-items-center rounded-md ${
                      active
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-white/[0.04] text-[var(--color-text-dim)]"
                    }`}
                  >
                    {p.icon === "cloud" ? (
                      <Cloud className="size-3" />
                    ) : (
                      <Server className="size-3" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div
                      className={`truncate text-[12.5px] font-medium ${
                        active ? "text-white" : "text-[var(--color-text)]"
                      }`}
                    >
                      {p.name}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                      <span
                        className={`size-1.5 rounded-full ${
                          p.status === "connected"
                            ? "bg-emerald-400"
                            : "bg-red-400"
                        }`}
                      />
                      <span>
                        {p.status === "connected" ? "Connected" : "Disconnected"}
                      </span>
                    </div>
                  </div>
                  {active && (
                    <Check className="size-3.5 shrink-0 text-[var(--color-accent)]" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
