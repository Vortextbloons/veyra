import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
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

  const backgroundJobsEnabled = useSettingsStore((s) => s.backgroundJobsEnabled);
  const setBackgroundJobsEnabled = useSettingsStore((s) => s.setBackgroundJobsEnabled);

  const artifactsEnabled = useSettingsStore((s) => s.artifactsEnabled);
  const setArtifactsEnabled = useSettingsStore((s) => s.setArtifactsEnabled);
  const interactiveAnswersEnabled = useSettingsStore((s) => s.interactiveAnswersEnabled);
  const setInteractiveAnswersEnabled = useSettingsStore((s) => s.setInteractiveAnswersEnabled);

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
              className={`${settingsTextareaClass} max-w-[980px]`}
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
        title="Background work"
        description="Short helper requests Veyra runs on its own after a reply finishes."
      >
        <SettingsCard>
          <SettingsRows>
            <SettingRow
              label="Background jobs"
              description="Lets Veyra extract durable memory after a conversation turn. Turning this off keeps all memory writes manual."
            >
              <Toggle
                ariaLabel="Background jobs"
                on={backgroundJobsEnabled}
                onChange={setBackgroundJobsEnabled}
              />
            </SettingRow>
          </SettingsRows>
        </SettingsCard>
      </SettingsPanel>
    </div>
  );
}
