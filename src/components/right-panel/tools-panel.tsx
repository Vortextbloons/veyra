import type { ReactNode } from "react";
import { FileText, Globe } from "lucide-react";
import { PanelShell } from "@/components/right-panel";
import { useSettingsStore } from "@/stores/settings-store";

export function ToolRow({
  icon,
  label,
  on,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`flex h-8 w-full cursor-pointer items-center gap-2 rounded-md px-2.5 text-left text-[12px] transition-colors ${
        on
          ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/15"
          : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
      }`}
    >
      <span
        className={`grid size-4 place-items-center transition-colors ${
          on ? "text-emerald-300" : "text-[var(--color-text-dim)]"
        }`}
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
}: {
  icon: ReactNode;
  label: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="group/tool relative">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${label}: ${on ? "on" : "off"}`}
        onClick={() => onChange(!on)}
        className={`grid size-8 place-items-center rounded-md transition-colors ${
          on
            ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20 hover:bg-emerald-500/15"
            : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
        }`}
      >
        <span
          className={`grid place-items-center transition-colors ${
            on ? "text-emerald-300" : "text-[var(--color-text-dim)]"
          }`}
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
          · {on ? "On" : "Off"}
        </span>
      </div>
    </div>
  );
}

export function ToolsPanel({
  webSearch,
  onWebSearchChange,
}: {
  webSearch: boolean;
  onWebSearchChange: (on: boolean) => void;
}) {
  const documentPanelEnabled = useSettingsStore((s) => s.documentPanelEnabled);
  const setDocumentPanelEnabled = useSettingsStore((s) => s.setDocumentPanelEnabled);

  return (
    <PanelShell title="Tools">
      <div className="space-y-0.5">
        <ToolRow
          icon={<Globe className="size-3.5" />}
          label="Web Search"
          on={webSearch}
          onChange={onWebSearchChange}
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

export function SettingToggle({
  label,
  description,
  on,
  onChange,
}: {
  label: string;
  description?: string;
  on: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="flex w-full items-center justify-between gap-2 rounded-md px-1 py-0.5 text-left"
    >
      <div className="min-w-0">
        <span className="block text-[11px] font-medium text-[var(--color-text)]">{label}</span>
        {description && (
          <span className="block text-[10px] text-[var(--color-text-dim)]">{description}</span>
        )}
      </div>
      <span
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          on ? "bg-emerald-500" : "bg-white/10"
        }`}
      >
        <span
          className={`inline-block size-3 rounded-full bg-white shadow-sm transition-transform ${
            on ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}
