import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import type { ProviderInfo } from "@/modules/chat/chat-types";
import { providerSupportsStartServer } from "@/lib/providers";
import type { ProviderConnectionPhase } from "@/stores/provider-store";
import { useClickOutside } from "@/hooks/use-click-outside";
import { SelectorMenu, SelectorOption, SelectorTrigger } from "@/components/ui/selector";

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
      <SelectorTrigger
        label={current?.name ?? "Provider"}
        labelMaxWidth="max-w-[140px]"
        open={open}
        onClick={() => setOpen((v) => !v)}
        badge={
          current && (
            <span
              className={`size-1.5 rounded-full ${
                connecting
                  ? "animate-pulse bg-amber-400"
                  : current.status === "connected"
                    ? "bg-emerald-400"
                    : "bg-red-400"
              }`}
            />
          )
        }
      />

      {open && (
        <SelectorMenu>
          <div className="px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
            Provider
          </div>
          <div className="space-y-0.5 p-1">
            {providers.map((p) => (
              <SelectorOption
                key={p.id}
                active={p.id === value}
                onSelect={() => {
                  onChange?.(p.id);
                  setOpen(false);
                }}
                primary={p.name}
                meta={
                  <>
                    <span
                      className={`size-1.5 rounded-full ${
                        p.status === "connected" ? "bg-emerald-400" : "bg-red-400"
                      }`}
                    />
                    <span>{p.status === "connected" ? "Connected" : "Disconnected"}</span>
                  </>
                }
              />
            ))}
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
        </SelectorMenu>
      )}
    </div>
  );
}
