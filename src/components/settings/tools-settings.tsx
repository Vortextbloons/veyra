import { SettingRow, SettingsCard, SettingsHeader, SettingsPanel } from "./settings-ui";
import { Toggle } from "@/components/toggle";
import { useSettingsStore } from "@/stores/settings-store";
import { WebSearchSettings } from "./web-search-settings";

export function ToolsSettings() {
  const enabled = useSettingsStore((state) => state.codeExecutionEnabled);
  const setEnabled = useSettingsStore((state) => state.setCodeExecutionEnabled);
  const bashEnabled = useSettingsStore((state) => !state.disabledNativeToolIds.includes("bash"));
  const setNativeToolEnabled = useSettingsStore((state) => state.setNativeToolEnabled);
  return (
    <div className="space-y-8">
      <SettingsHeader
        title="Tools"
        description="Choose which tools the AI can use to search, process data, and work in your projects."
      />

      <SettingsPanel title="Code execution" description="Run JavaScript locally to calculate results and process supplied text or file contents.">
        <SettingsCard>
          <SettingRow label="Enable code execution" description="Runs in an isolated sandbox with no network or direct file access. Each run starts fresh, with a 5-second execution limit and 64 MB of guest memory. File changes use the existing file tools and permissions.">
            <Toggle ariaLabel="Enable code execution" on={enabled} onChange={setEnabled} />
          </SettingRow>
        </SettingsCard>
      </SettingsPanel>
      <SettingsPanel title="Bash commands" description="Run shell commands when a project folder is attached.">
        <SettingsCard>
          <SettingRow label="Enable Bash by default" description="Available by default in project chats. Turn it off for an individual chat from the composer. Commands still follow your permission settings; turning this off disables Bash everywhere.">
            <Toggle ariaLabel="Enable Bash by default" on={bashEnabled} onChange={(next) => setNativeToolEnabled("bash", next)} />
          </SettingRow>
        </SettingsCard>
      </SettingsPanel>
      <WebSearchSettings />
    </div>
  );
}
