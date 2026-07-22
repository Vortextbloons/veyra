import { Loader2, PlugZap } from "lucide-react";
import type { ProviderInfo } from "@/modules/chat/chat-types";
import { providerSupportsStartServer } from "@/lib/providers";
import type { ProviderConnectionPhase } from "@/stores/provider-store";

type ProviderConnectionBannerProps = {
  provider: ProviderInfo | null;
  phase: ProviderConnectionPhase;
  error: string | null;
  onReconnect: () => void;
  onStartServer: () => void;
};

export function ProviderConnectionBanner({
  provider,
  phase,
  error,
  onReconnect,
  onStartServer,
}: ProviderConnectionBannerProps) {
  if (!provider || provider.status === "connected") return null;

  const connecting = phase === "connecting";
  const canStart = providerSupportsStartServer(provider.id);

  return (
    <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/[0.055] px-5 py-2.5">
      <div className="flex items-center gap-3">
        <div className="grid size-7 shrink-0 place-items-center text-amber-300">
          {connecting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <PlugZap className="size-4" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-amber-100">
            {connecting ? `Connecting to ${provider.name}…` : `${provider.name} is offline`}
          </p>
          <p className="truncate text-[11px] text-[var(--color-text-dim)]">
            {connecting
              ? "Checking the local server and available models."
              : "Start the local server or retry when it is ready."}
          </p>
          {error && !connecting && <span className="sr-only">{error}</span>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            disabled={connecting}
            onClick={onReconnect}
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-amber-500/20 bg-black/10 px-2.5 text-[11px] font-medium text-amber-100 transition-colors hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {connecting && <Loader2 className="size-3 animate-spin" aria-hidden />}
            Retry
          </button>

          {canStart && (
            <button
              type="button"
              disabled={connecting}
              onClick={onStartServer}
              className="inline-flex h-7 items-center gap-1.5 rounded-md bg-amber-200 px-2.5 text-[11px] font-medium text-[#211b0c] transition-colors hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting && <Loader2 className="size-3 animate-spin" aria-hidden />}
              Start server
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
