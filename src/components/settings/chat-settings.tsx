import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "@/components/settings/model-dropdown";
import { useProviderStore } from "@/stores/provider-store";

export function ChatSettings() {
  const defaultSystemPrompt = useSettingsStore((s) => s.defaultSystemPrompt);
  const setDefaultSystemPrompt = useSettingsStore((s) => s.setDefaultSystemPrompt);
  const autoNameEnabled = useSettingsStore((s) => s.autoNameEnabled);
  const setAutoNameEnabled = useSettingsStore((s) => s.setAutoNameEnabled);
  const autoNameModel = useSettingsStore((s) => s.autoNameModel);
  const setAutoNameModel = useSettingsStore((s) => s.setAutoNameModel);
  const backgroundJobsEnabled = useSettingsStore((s) => s.backgroundJobsEnabled);
  const setBackgroundJobsEnabled = useSettingsStore((s) => s.setBackgroundJobsEnabled);
  const autoSummarizeChats = useSettingsStore((s) => s.autoSummarizeChats);
  const setAutoSummarizeChats = useSettingsStore((s) => s.setAutoSummarizeChats);
  const summaryModel = useSettingsStore((s) => s.summaryModel);
  const setSummaryModel = useSettingsStore((s) => s.setSummaryModel);
  const contextAnchoringEnabled = useSettingsStore((s) => s.contextAnchoringEnabled);
  const setContextAnchoringEnabled = useSettingsStore((s) => s.setContextAnchoringEnabled);
  const studioModeEnabled = useSettingsStore((s) => s.studioModeEnabled);
  const setStudioModeEnabled = useSettingsStore((s) => s.setStudioModeEnabled);

  const models = useProviderStore((s) => s.models);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">Studio Mode</h2>
        <div className="space-y-3">
          <Toggle label="Enable Studio Mode" on={studioModeEnabled} onChange={setStudioModeEnabled} />
          <p className="text-[11px] text-[var(--color-text-dim)]">Allows chat and character conversations to render isolated HTML and CSS visual artifacts. Scripts and remote resources remain blocked.</p>
        </div>
      </section>
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          System Prompt
        </h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <textarea
            value={defaultSystemPrompt}
            onChange={(e) => setDefaultSystemPrompt(e.target.value)}
            rows={6}
            placeholder="You are a helpful assistant that..."
            className="w-full resize-none rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[12px] leading-relaxed text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)]/40 focus:outline-none"
          />
          <p className="mt-2 text-[11px] text-[var(--color-text-dim)]">
            Custom instructions prepended to every conversation. Leave empty to use Veyra's defaults.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Background Jobs
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Run background jobs"
              on={backgroundJobsEnabled}
              onChange={setBackgroundJobsEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Required for auto-naming and auto-summarize. When off, those jobs will not run even if enabled below.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Auto-naming
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable auto-naming"
              on={autoNameEnabled}
              onChange={setAutoNameEnabled}
            />
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">
                Auto-name model
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Model used to generate titles. Leave empty to use the currently selected model.
              </div>
            </div>
            <ModelDropdown
              models={models}
              value={autoNameModel}
              onChange={setAutoNameModel}
              placeholder="Use selected model"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Summarization
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Auto-summarize chats"
              on={autoSummarizeChats}
              onChange={setAutoSummarizeChats}
            />
          </div>

          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
            <div className="mb-2">
              <div className="text-[12.5px] font-medium text-white">
                Summary model
              </div>
              <div className="text-[11px] text-[var(--color-text-dim)]">
                Model used to generate chat summaries. Leave empty to use the currently selected model.
              </div>
            </div>
            <ModelDropdown
              models={models}
              value={summaryModel}
              onChange={setSummaryModel}
              placeholder="Use selected model"
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Context Anchoring
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable context anchoring"
              on={contextAnchoringEnabled}
              onChange={setContextAnchoringEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Provides the AI with the current date/time and platform on the first message of each chat to reduce hallucinated dates and times.
          </p>
        </div>
      </section>

    </div>
  );
}
