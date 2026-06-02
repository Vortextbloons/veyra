import { Loader2, PlugZap, RefreshCw, Server, Play } from "lucide-react";
import type { ProviderInfo } from "@/lib/chat-types";
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
  const isLmStudio = provider.id === "lm-studio";

  return (
    <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
      <div className="mx-auto flex max-w-2xl gap-3 rounded-xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.08] via-[var(--color-panel)] to-violet-500/[0.06] p-3.5 shadow-lg shadow-black/20">
        <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-500/15 text-amber-300 ring-1 ring-inset ring-amber-500/20">
          {connecting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <PlugZap className="size-4" aria-hidden />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-white">
            {connecting
              ? `Connecting to ${provider.name}…`
              : `${provider.name} is offline`}
          </p>
          <p className="mt-0.5 text-[12px] leading-relaxed text-[var(--color-text-dim)]">
            {connecting
              ? isLmStudio
                ? "Checking the local server and loading models."
                : "Checking provider availability."
              : isLmStudio
                ? "Start the LM Studio server or retry if it is already running in the background."
                : "Retry the connection when the provider is ready."}
          </p>

          {error && !connecting && (
            <p className="mt-2 rounded-md border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11.5px] leading-snug text-red-200/90">
              {error}
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={connecting}
              onClick={onReconnect}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--color-border-strong)] bg-white/[0.04] px-3 text-[12px] font-medium text-white transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {connecting ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
              ) : (
                <RefreshCw className="size-3.5" aria-hidden />
              )}
              Retry connection
            </button>

            {canStart && (
              <button
                type="button"
                disabled={connecting}
                onClick={onStartServer}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12px] font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {connecting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                ) : (
                  <Play className="size-3.5" aria-hidden />
                )}
                Start server
              </button>
            )}
          </div>

          {isLmStudio && !connecting && (
            <p className="mt-2.5 flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
              <Server className="size-3 shrink-0 opacity-70" aria-hidden />
              Uses the <span className="font-mono text-[var(--color-text)]">lms</span> CLI — install
              LM Studio and add it to your PATH.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
