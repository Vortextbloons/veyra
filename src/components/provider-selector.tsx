import { useRef, useState } from "react";
import { ChevronDown, Check, Loader2 } from "lucide-react";
import type { ProviderInfo } from "@/modules/chat/chat-types";
import { providerSupportsStartServer } from "@/lib/providers";
import type { ProviderConnectionPhase } from "@/stores/provider-store";
import { useClickOutside } from "@/hooks/use-click-outside";

type ProviderSelectorProps = {
  value: string;
  providers?: ProviderInfo[];
  onChange?: (id: string) => void;
  connectionPhase?: ProviderConnectionPhase;
  onReconnect?: (providerId: string) => void;
  onStartServer?: (providerId: string) => void;
};

export function ProviderSelector({
  value,
  providers = [],
  onChange,
  connectionPhase = "idle",
  onReconnect,
  onStartServer,
}: ProviderSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const current = providers.find((p) => p.id === value) ?? null;
  const connecting = connectionPhase === "connecting";
  const showActions =
    current?.status === "disconnected" &&
    (onReconnect || (onStartServer && providerSupportsStartServer(current.id)));

  useClickOutside(ref, open, () => setOpen(false));

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
        <span className="max-w-[140px] truncate font-medium">
          {current?.name ?? "Provider"}
        </span>
        {current && (
          <span
            className={`size-1.5 rounded-full ${
              connecting
                ? "animate-pulse bg-amber-400"
                : current.status === "connected"
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
          className="absolute bottom-full left-0 z-50 mb-1.5 w-64 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl shadow-black/40"
        >
          <div className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Provider
          </div>
          <div className="space-y-0.5 p-1">
            {providers.map((p) => {
              const active = p.id === value;
              return (
                <button
                  type="button"
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
                </button>
              );
            })}
          </div>

          {showActions && current && (
            <div className="border-t border-[var(--color-border)] p-2">
              <p className="mb-2 px-1 text-[10.5px] leading-snug text-[var(--color-text-dim)]">
                {current.id === "lm-studio"
                  ? "Start the local server or retry if LM Studio is already open."
                  : "Retry when the provider is ready."}
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={connecting}
                  onClick={(e) => {
                    e.stopPropagation();
                    onReconnect?.(current.id);
                  }}
                  className="flex flex-1 items-center justify-center gap-1 rounded-md border border-[var(--color-border)] bg-white/[0.03] py-1.5 text-[11px] font-medium text-white hover:bg-white/[0.06] disabled:opacity-50"
                >
                  {connecting && <Loader2 className="size-3 animate-spin" />}
                  Retry
                </button>
                {providerSupportsStartServer(current.id) && onStartServer && (
                  <button
                    type="button"
                    disabled={connecting}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartServer(current.id);
                    }}
                    className="flex flex-1 items-center justify-center gap-1 rounded-md bg-[var(--color-accent)] py-1.5 text-[11px] font-medium text-white hover:brightness-110 disabled:opacity-50"
                  >
                    {connecting && <Loader2 className="size-3 animate-spin" />}
                    Start
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
