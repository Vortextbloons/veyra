import { useState } from "react";
import { Save } from "lucide-react";
import type { ProjectRecord, ProjectSettings } from "@/modules/projects/project-types";
import { useProjectStore } from "@/modules/projects/project-store";
import { useSettingsStore } from "@/stores/settings-store";
import type { MemoryMode } from "@/lib/memory-types";
import { Toggle } from "@/components/toggle";

export function ProjectSettingsPanel({ project }: { project: ProjectRecord }) {
  const updateProject = useProjectStore((s) => s.updateProject);
  const globalSettings = useSettingsStore.getState();

  const [settings, setSettings] = useState<ProjectSettings>(project.settings ?? {});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProject(project.id, { settings });
    } finally {
      setSaving(false);
    }
  };

  const update = <K extends keyof ProjectSettings>(key: K, value: ProjectSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div className="w-full space-y-4">
      <h3 className="text-[12.5px] font-medium text-[var(--color-text)]">Project Settings</h3>
      <p className="text-[10.5px] text-[var(--color-text-dim)]">
        These override global defaults when this project is active. Leave blank to use global settings.
      </p>

      {/* Memory */}
      <SettingGroup label="Memory">
        <ToggleRow
          label="Enable memory retrieval"
          value={settings.memoryEnabled}
          onChange={(v) => update("memoryEnabled", v)}
          globalLabel={`Global: ${globalSettings.defaultMemoryEnabled ? "on" : "off"}`}
        />
        {settings.memoryEnabled !== false && (
          <SelectRow
            label="Memory mode"
            value={settings.memoryMode ?? ""}
            onChange={(v) => update("memoryMode", (v || undefined) as MemoryMode | undefined)}
            options={[
              { value: "", label: "Use global default" },
              { value: "safe_auto_save", label: "Safe auto-save" },
              { value: "review_all", label: "Review all" },
              { value: "aggressive_project_memory", label: "Aggressive project memory" },
              { value: "manual_only", label: "Manual only" },
              { value: "off", label: "Off" },
            ]}
          />
        )}
      </SettingGroup>

      {/* Web Search */}
      <SettingGroup label="Web Search">
        <ToggleRow
          label="Enable web search"
          value={settings.webSearchEnabled}
          onChange={(v) => update("webSearchEnabled", v)}
          globalLabel={`Global: ${globalSettings.defaultWebSearchEnabled ? "on" : "off"}`}
        />
        {settings.webSearchEnabled !== false && (
          <SelectRow
            label="Search mode"
            value={settings.webSearchMode ?? ""}
            onChange={(v) => update("webSearchMode", (v || undefined) as "auto" | "always" | "off" | undefined)}
            options={[
              { value: "", label: "Use global default" },
              { value: "auto", label: "Auto (when relevant)" },
              { value: "always", label: "Always search" },
              { value: "off", label: "Off" },
            ]}
          />
        )}
      </SettingGroup>

      {/* Tools */}
      <SettingGroup label="Tools">
        <ToggleRow
          label="Document tools"
          value={settings.enabledTools?.documents}
          onChange={(v) =>
            update("enabledTools", {
              documents: v,
              webSearch: settings.enabledTools?.webSearch ?? true,
            })
          }
        />
        <ToggleRow
          label="Web search tool"
          value={settings.enabledTools?.webSearch}
          onChange={(v) =>
            update("enabledTools", {
              documents: settings.enabledTools?.documents ?? true,
              webSearch: v,
            })
          }
        />
      </SettingGroup>

      {/* Model overrides */}
      <SettingGroup label="Model Overrides">
        <InputRow
          label="Temperature"
          type="number"
          value={settings.temperature?.toString() ?? ""}
          onChange={(v) => update("temperature", v ? parseFloat(v) : undefined)}
          placeholder={`Global: ${globalSettings.defaultTemperature}`}
          min={0}
          max={2}
          step={0.1}
        />
        <InputRow
          label="Context length"
          type="number"
          value={settings.contextLength?.toString() ?? ""}
          onChange={(v) => update("contextLength", v ? parseInt(v) : undefined)}
          placeholder={`Global: ${globalSettings.defaultContextLength}`}
          min={1024}
          max={131072}
          step={1024}
        />
        <InputRow
          label="Max tokens"
          type="number"
          value={settings.maxTokens?.toString() ?? ""}
          onChange={(v) => update("maxTokens", v ? parseInt(v) : undefined)}
          placeholder={`Global: ${globalSettings.defaultMaxTokens || "unlimited"}`}
          min={0}
          max={131072}
          step={256}
        />
      </SettingGroup>

      {/* Agent path */}
      <SettingGroup label="Agent">
        <InputRow
          label="Project path"
          type="text"
          value={settings.agentProjectPath ?? ""}
          onChange={(v) => update("agentProjectPath", v || undefined)}
          placeholder="Filesystem path for agent mode"
        />
      </SettingGroup>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-4 py-1.5 text-[12px] font-medium text-white hover:brightness-110 disabled:opacity-40"
        >
          <Save className="size-3.5" />
          {saving ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

function SettingGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-3">
      <h4 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
        {label}
      </h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  globalLabel,
}: {
  label: string;
  value?: boolean;
  onChange: (v: boolean) => void;
  globalLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-[12px] text-[var(--color-text)]">{label}</span>
        {globalLabel && (
          <span className="ml-2 text-[10px] text-[var(--color-text-dim)]">{globalLabel}</span>
        )}
      </div>
      <Toggle on={value ?? false} onChange={onChange} />
    </div>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--color-text)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] focus:border-[var(--color-accent)] focus:outline-none"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function InputRow({
  label,
  type,
  value,
  onChange,
  placeholder,
  min,
  max,
  step,
}: {
  label: string;
  type: "text" | "number";
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--color-text)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        className="w-32 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] focus:outline-none"
      />
    </div>
  );
}
