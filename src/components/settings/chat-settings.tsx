import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "@/components/settings/model-dropdown";
import { useProviderStore } from "@/stores/provider-store";
import {
  SettingRow,
  SettingsCallout,
  SettingsCard,
  SettingsHeader,
  SettingsPanel,
  SettingsRows,
  settingsTextareaClass,
} from "./settings-ui";

export function ChatSettings() {
  const defaultSystemPrompt = useSettingsStore((s) => s.defaultSystemPrompt);
  const setDefaultSystemPrompt = useSettingsStore((s) => s.setDefaultSystemPrompt);
  const systemPromptReplacesDefault = useSettingsStore((s) => s.systemPromptReplacesDefault);
  const setSystemPromptReplacesDefault = useSettingsStore((s) => s.setSystemPromptReplacesDefault);

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

  const artifactsEnabled = useSettingsStore((s) => s.artifactsEnabled);
  const setArtifactsEnabled = useSettingsStore((s) => s.setArtifactsEnabled);
  const interactiveAnswersEnabled = useSettingsStore((s) => s.interactiveAnswersEnabled);
  const setInteractiveAnswersEnabled = useSettingsStore((s) => s.setInteractiveAnswersEnabled);

  const models = useProviderStore((s) => s.models);

  const promptIsEmpty = !defaultSystemPrompt.trim();

  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Chat"
        description="How Veyra prompts the model and what it does behind the scenes in a conversation."
      />

      <SettingsPanel
        title="System prompt"
        description="Your own instructions for every new conversation. Per-model prompts in Models override this text."
      >
        <SettingsCard>
          <div className="px-5 py-4">
            <label
              htmlFor="default-system-prompt"
              className="mb-2 block text-[13.5px] font-medium text-white"
            >
              Custom instructions
            </label>
            <textarea
              id="default-system-prompt"
              value={defaultSystemPrompt}
              onChange={(e) => setDefaultSystemPrompt(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder="You are a direct, technically precise assistant. Answer in plain language and skip the preamble."
              className={settingsTextareaClass}
            />
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-text-dim)]">
              {systemPromptReplacesDefault
                ? "Sent as the only system prompt. Veyra's defaults and the runtime's built-in tool guidance are dropped, so tool use can become less reliable."
                : "Appended after Veyra's defaults. Leave empty to use Veyra's defaults only."}
            </p>
          </div>
          <div className="border-t border-[var(--color-border)]">
            <SettingsRows>
              <SettingRow
                label="Use as the only system prompt"
                description="Replaces the default prompt completely instead of adding to it."
              >
                <Toggle
                  ariaLabel="Use as the only system prompt"
                  on={systemPromptReplacesDefault}
                  onChange={setSystemPromptReplacesDefault}
                />
              </SettingRow>
            </SettingsRows>
          </div>
        </SettingsCard>
        {systemPromptReplacesDefault && promptIsEmpty && (
          <div className="mt-3">
            <SettingsCallout tone="warning" title="No custom prompt yet">
              The toggle is on but the box is empty, so chats run on the runtime's built-in prompt
              with none of Veyra's defaults.
            </SettingsCallout>
          </div>
        )}
      </SettingsPanel>

      <SettingsPanel
        title="Response behavior"
        description="Both controls only affect new replies; existing messages are unchanged."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow
              label="Artifacts"
              description="Let the model deliver self-contained HTML pages, documents, and code as downloadable artifacts."
            >
              <Toggle
                ariaLabel="Artifacts"
                on={artifactsEnabled}
                onChange={setArtifactsEnabled}
              />
            </SettingRow>
            <SettingRow
              label="Interactive answers"
              description="Let the model ask multiple-choice questions inside chat when a decision would change the outcome."
            >
              <Toggle
                ariaLabel="Interactive answers"
                on={interactiveAnswersEnabled}
                onChange={setInteractiveAnswersEnabled}
              />
            </SettingRow>
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>

      <SettingsPanel
        title="Automation"
        description="Background jobs are required for auto-naming and auto-summarize."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow
              label="Background jobs"
              description="Runs short helper requests after a reply. Turning this off disables everything below."
            >
              <Toggle
                ariaLabel="Background jobs"
                on={backgroundJobsEnabled}
                onChange={setBackgroundJobsEnabled}
              />
            </SettingRow>
            <SettingRow
              label="Auto-name conversations"
              description="Generates a short title from the first exchange."
            >
              <Toggle
                ariaLabel="Auto-name conversations"
                on={autoNameEnabled}
                onChange={setAutoNameEnabled}
                disabled={!backgroundJobsEnabled}
              />
            </SettingRow>
            <SettingRow label="Auto-name model" description="Leave empty to use the selected model.">
              <div className="w-full sm:w-[260px]">
                <ModelDropdown
                  models={models}
                  value={autoNameModel}
                  onChange={setAutoNameModel}
                  placeholder="Use selected model"
                />
              </div>
            </SettingRow>
            <SettingRow
              label="Auto-summarize long chats"
              description="Condenses older turns so the context window keeps useful history."
            >
              <Toggle
                ariaLabel="Auto-summarize long chats"
                on={autoSummarizeChats}
                onChange={setAutoSummarizeChats}
                disabled={!backgroundJobsEnabled}
              />
            </SettingRow>
            <SettingRow label="Summary model" description="Leave empty to use the selected model.">
              <div className="w-full sm:w-[260px]">
                <ModelDropdown
                  models={models}
                  value={summaryModel}
                  onChange={setSummaryModel}
                  placeholder="Use selected model"
                />
              </div>
            </SettingRow>
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>
    </div>
  );
}
