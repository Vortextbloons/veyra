import { CollapsibleSettingsSection } from "./collapsible-settings-section";

export function CodeExecutionSettings() {
  return (
    <div className="space-y-8">
      <CollapsibleSettingsSection
        subsectionKey="codeExecution:security"
        title="Security notes"
        description="Python execution uses timeouts and isolated-mode flags, but these are not a security boundary."
        keywords={["python", "sandbox", "security"]}
        defaultExpanded
      >
        <p className="text-[11.5px] leading-5 text-[var(--color-text-dim)]">
          The host Python interpreter cannot safely isolate files, credentials, processes, or the
          network. The previous import scanner was removed because Python expressions can bypass
          textual blacklists. Timeouts and isolated-mode flags limit some behavior, but they are
          not a substitute for an OS-enforced sandbox.
        </p>
      </CollapsibleSettingsSection>
    </div>
  );
}
