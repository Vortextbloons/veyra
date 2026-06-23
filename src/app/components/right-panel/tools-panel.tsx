import type { ReactNode } from "react";
import { FileText, Globe, TerminalSquare } from "lucide-react";
import { PanelShell } from "@/app/components/right-panel";
import { useSettingsStore } from "@/stores/settings-store";

type ToolAccent = "emerald" | "amber" | "cyan";

const TOOL_ACCENT_STYLES: Record<ToolAccent, { on: string; icon: string; pill: string }> = {
  emerald: {
    on: "border-emerald-500/20 bg-emerald-500/5 text-emerald-300",
    icon: "text-emerald-400",
    pill: "bg-emerald-500/15 text-emerald-300",
  },
  amber: {
    on: "border-amber-500/20 bg-amber-500/5 text-amber-300",
    icon: "text-amber-400",
    pill: "bg-amber-500/15 text-amber-300",
  },
  cyan: {
    on: "border-cyan-500/20 bg-cyan-500/5 text-cyan-300",
    icon: "text-cyan-400",
    pill: "bg-cyan-500/15 text-cyan-300",
  },
};

export function ToolRow({
  icon,
  label,
  on,
  onChange,
  disabled = false,
  disabledReason,
  accent = "emerald",
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  accent?: ToolAccent;
}) {
  const accentStyles = TOOL_ACCENT_STYLES[accent];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-disabled={disabled}
      title={disabled ? disabledReason : undefined}
      disabled={disabled}
      onClick={() => {
        if (!disabled) onChange(!on);
      }}
      className={`flex h-11 w-full items-center gap-2.5 rounded-xl border px-3 text-left text-[12.5px] transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-50 border-[var(--color-border)]"
          : "cursor-pointer"
      } ${
        on
          ? accentStyles.on
          : "border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
      }`}
    >
      <span
        className={`grid size-5 place-items-center transition-colors ${on ? accentStyles.icon : "text-[var(--color-text-dim)]"}`}
      >
        {icon}
      </span>
      <span className="flex-1 font-medium">{label}</span>
    </button>
  );
}

export function CompactToolToggle({
  icon,
  label,
  on,
  onChange,
  disabled = false,
  disabledReason,
  accent = "emerald",
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
  disabledReason?: string;
  accent?: ToolAccent;
}) {
  const accentStyles = TOOL_ACCENT_STYLES[accent];

  return (
    <div className="group/tool relative">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-disabled={disabled}
        aria-label={`${label}: ${on ? "on" : "off"}`}
        disabled={disabled}
        onClick={() => {
          if (!disabled) onChange(!on);
        }}
        className={`grid size-8 place-items-center rounded-md transition-colors ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } ${
          on ? accentStyles.on : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        <span
          className={`grid place-items-center transition-colors ${on ? accentStyles.icon : "text-[var(--color-text-dim)]"}`}
        >
          {icon}
        </span>
      </button>

      <div
        role="tooltip"
        className="pointer-events-none absolute right-full top-1/2 z-50 mr-2.5 -translate-y-1/2 whitespace-nowrap rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2.5 py-1.5 text-[11px] text-[var(--color-text)] opacity-0 shadow-lg shadow-black/30 transition-opacity duration-150 group-hover/tool:opacity-100"
      >
        <span className="font-medium">{label}</span>
        <span className="text-[var(--color-text-dim)]">
          {" "}
          · {disabled ? "Unavailable" : on ? "On" : "Off"}
        </span>
        {disabled && disabledReason && (
          <span className="mt-0.5 block max-w-[220px] whitespace-normal text-[10px] text-[var(--color-text-dim)]">
            {disabledReason}
          </span>
        )}
      </div>
    </div>
  );
}

function WebSearchSpeedToggle() {
  const preset = useSettingsStore((s) => s.webSearchSpeedPreset);
  const setPreset = useSettingsStore((s) => s.setWebSearchSpeedPreset);
  const accent = preset === "fast" ? "cyan" : "emerald";
  const accentStyles = TOOL_ACCENT_STYLES[accent];

  return (
    <div role="radiogroup" aria-label="Search speed" className="flex rounded-xl border border-[var(--color-border)] p-0.5">
      {(["normal", "fast"] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          role="radio"
          aria-checked={preset === mode}
          onClick={() => setPreset(mode)}
          className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-medium transition-colors ${
            preset === mode
              ? accentStyles.pill
              : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
          }`}
        >
          {mode === "normal" ? "Normal" : "Fast"}
        </button>
      ))}
    </div>
  );
}

export function ToolsPanel({
  webSearch,
  onWebSearchChange,
  webSearchDisabled = false,
  webSearchDisabledReason,
  codeExecution,
  onCodeExecutionChange,
  codeExecutionDisabled = false,
  codeExecutionDisabledReason,
}: {
  webSearch: boolean;
  onWebSearchChange: (on: boolean) => void;
  webSearchDisabled?: boolean;
  webSearchDisabledReason?: string;
  codeExecution: boolean;
  onCodeExecutionChange: (on: boolean) => void;
  codeExecutionDisabled?: boolean;
  codeExecutionDisabledReason?: string;
}) {
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const setDocumentPanelEnabled = useSettingsStore((s) => s.setDocumentPanelEnabled);
  const speedPreset = useSettingsStore((s) => s.webSearchSpeedPreset);
  const webSearchOn = !webSearchDisabled && webSearch;

  return (
    <PanelShell title="Tools">
      <div className="space-y-2">
        <ToolRow
          icon={<Globe className="size-3.5" />}
          label="Web Search"
          on={webSearchOn}
          onChange={onWebSearchChange}
          disabled={webSearchDisabled}
          disabledReason={webSearchDisabledReason}
          accent={webSearchOn && speedPreset === "fast" ? "cyan" : "emerald"}
        />
        {webSearchOn && <WebSearchSpeedToggle />}
        <ToolRow
          icon={<TerminalSquare className="size-3.5" />}
          label="Code Execution"
          on={codeExecutionDisabled ? false : codeExecution}
          onChange={onCodeExecutionChange}
          disabled={codeExecutionDisabled}
          disabledReason={codeExecutionDisabledReason}
          accent="amber"
        />
        <ToolRow
          icon={<FileText className="size-3.5" />}
          label="Documents"
          on={documentPanelEnabled}
          onChange={setDocumentPanelEnabled}
        />
      </div>
    </PanelShell>
  );
}

