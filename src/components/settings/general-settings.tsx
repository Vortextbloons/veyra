import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { Toggle } from "@/components/toggle";
import { Star } from "lucide-react";
import { ModelIcon } from "@/components/model-icon";

export function GeneralSettings() {
  const favoriteModels = useSettingsStore((s) => s.favoriteModels);
  const toggleFavoriteModel = useSettingsStore((s) => s.toggleFavoriteModel);
  const autoNameEnabled = useSettingsStore((s) => s.autoNameEnabled);
  const setAutoNameEnabled = useSettingsStore((s) => s.setAutoNameEnabled);
  const defaultMemoryEnabled = useSettingsStore((s) => s.defaultMemoryEnabled);
  const setDefaultMemoryEnabled = useSettingsStore((s) => s.setDefaultMemoryEnabled);
  const memoryExtractionEnabled = useSettingsStore((s) => s.memoryExtractionEnabled);
  const setMemoryExtractionEnabled = useSettingsStore((s) => s.setMemoryExtractionEnabled);

  const models = useProviderStore((s) => s.models);
  const selectedProvider = useProviderStore((s) => s.selectedProvider);
  const providers = useProviderStore((s) => s.providers);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const providerLabel = currentProvider?.name ?? "LM Studio";

  const favoriteModelsList = models.filter((m) => favoriteModels.includes(m.id));

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Favorite Models
        </h2>
        <p className="mb-3 text-[12px] text-[var(--color-text-dim)]">
          Favorited models appear at the top of the model selector across the app.
        </p>
        {favoriteModelsList.length === 0 ? (
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-6 text-center">
            <Star className="mx-auto mb-2 size-5 text-[var(--color-text-dim)]" />
            <p className="text-[12px] text-[var(--color-text-dim)]">
              No favorites yet. Star models in the chat header or models page.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {favoriteModelsList.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2.5"
              >
                <div className="grid size-7 shrink-0 place-items-center rounded-md bg-amber-500/15 text-amber-400">
                  <ModelIcon modelId={m.id} className="size-full" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium text-white">
                    {m.name}
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                    <span>{providerLabel}</span>
                    {m.size && (
                      <>
                        <span className="opacity-50">&middot;</span>
                        <span className="font-mono">{m.size}</span>
                      </>
                    )}
                    {m.contextWindow && (
                      <>
                        <span className="opacity-50">&middot;</span>
                        <span className="font-mono">
                          {m.contextWindow >= 1000
                            ? `${(m.contextWindow / 1000).toFixed(m.contextWindow % 1000 ? 1 : 0)}K`
                            : m.contextWindow}{" "}
                          ctx
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavoriteModel(m.id)}
                  className="grid size-7 place-items-center rounded-md text-amber-400 transition-colors hover:bg-white/[0.06]"
                >
                  <Star className="size-3.5" fill="currentColor" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Defaults
        </h2>
        <div className="flex flex-wrap gap-2">
          <Toggle
            label="Auto-name conversations"
            on={autoNameEnabled}
            onChange={setAutoNameEnabled}
          />
          <Toggle
            label="Default memory"
            on={defaultMemoryEnabled}
            onChange={setDefaultMemoryEnabled}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Memory Extraction
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Extract memories in background"
              on={memoryExtractionEnabled}
              onChange={setMemoryExtractionEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            When enabled, the scheduler automatically extracts and stores memories from conversations.
          </p>
        </div>
      </section>
    </div>
  );
}
