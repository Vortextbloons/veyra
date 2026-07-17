import { ShieldAlert } from "lucide-react";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";

export function CodeExecutionSettings() {
  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-amber-300" />
          <div>
            <p className="text-[12.5px] font-medium text-white">
              Native code execution is disabled
            </p>
            <p className="mt-1 text-[12px] leading-relaxed text-[var(--color-text-dim)]">
              Running the machine&apos;s Python interpreter cannot safely isolate files,
              credentials, processes, or the network. Veyra will re-enable this tool only
              after it uses an OS-enforced sandbox.
            </p>
          </div>
        </div>
      </section>

      <CollapsibleSettingsSection
        subsectionKey="codeExecution:security"
        title="Security boundary"
        description="Why interpreter selection and execution controls are unavailable."
        keywords={["python", "sandbox", "security", "disabled"]}
        defaultExpanded
      >
        <p className="text-[11.5px] leading-5 text-[var(--color-text-dim)]">
          The previous import scanner was removed because Python expressions can bypass
          textual blacklists. Timeouts and isolated-mode flags limit some behavior, but
          they are not a security boundary.
        </p>
      </CollapsibleSettingsSection>
    </div>
  );
}
