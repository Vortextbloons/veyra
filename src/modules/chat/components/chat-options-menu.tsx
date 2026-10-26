import { useState, type ReactNode } from "react";
import { FileText, Globe, LayoutDashboard, TerminalSquare, X, Zap } from "lucide-react";
import { DialogSurface } from "@/components/dialog-surface";
import { ChatExtensionsSettings } from "@/modules/extensions/components/chat-extensions-settings";
import { useSettingsStore } from "@/stores/settings-store";

export type ChatOptionsMenuProps = {
  open: boolean;
  onClose: () => void;
  enhancedMode: boolean;
  onEnhancedModeChange: (on: boolean) => void;
  webSearchEnabled: boolean;
  onWebSearchChange?: (on: boolean) => void;
  webSearchDisabled?: boolean;
  webSearchDisabledReason?: string;
  codeExecutionEnabled: boolean;
  onCodeExecutionChange?: (on: boolean) => void;
  codeExecutionDisabled?: boolean;
  codeExecutionDisabledReason?: string;
};

function SettingSwitch({ active, muted = false }: { active: boolean; muted?: boolean }) {
  const on = active && !muted;
  return (
    <span
      aria-hidden
      className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors ${
        on ? "bg-blue-500" : "bg-white/10"
      }`}
    >
      <span
        className={`block size-3 rounded-full bg-white shadow-sm transition-transform ${
          on ? "translate-x-3" : ""
        }`}
      />
    </span>
  );
}

function SettingRow({
  icon,
  label,
  description,
  active,
  onToggle,
  iconActiveClass = "text-sky-300",
  disabled = false,
  disabledReason,
  onDoubleClick,
  title,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  active: boolean;
  onToggle: (on: boolean) => void;
  iconActiveClass?: string;
  disabled?: boolean;
  disabledReason?: string;
  onDoubleClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-disabled={disabled}
      disabled={disabled}
      title={disabled ? disabledReason : title}
      onClick={() => {
        if (!disabled) onToggle(!active);
      }}
      onDoubleClick={!disabled ? onDoubleClick : undefined}
      className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
        disabled ? "cursor-not-allowed opacity-45" : "hover:bg-white/[0.05]"
      }`}
    >
      <span
        className={`shrink-0 transition-colors ${
          active && !disabled ? iconActiveClass : "text-[var(--color-text-dim)]"
        }`}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-medium text-white">{label}</span>
        <span className="block truncate text-[10.5px] text-[var(--color-text-dim)]">
          {description}
        </span>
      </span>
      <SettingSwitch active={active} muted={disabled} />
    </button>
  );
}

function SearchSpeedToggle({ on }: { on: boolean }) {
  const preset = useSettingsStore((s) => s.webSearchSpeedPreset);
  const setPreset = useSettingsStore((s) => s.setWebSearchSpeedPreset);

  if (!on) return null;

  return (
    <div className="flex items-center gap-2 px-2 pb-1.5 pt-0.5">
      <span className="text-[10.5px] text-[var(--color-text-dim)]">Search speed</span>
      <div
        role="radiogroup"
        aria-label="Search speed"
        className="ml-auto flex rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-0.5"
      >
        {(["normal", "fast"] as const).map((mode) => {
          const selected = preset === mode;
          return (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPreset(mode)}
              className={`rounded px-2 py-0.5 text-[10.5px] font-medium capitalize transition-colors ${
                selected
                  ? "bg-blue-500/20 text-blue-200"
                  : "text-[var(--color-text-dim)] hover:text-white"
              }`}
            >
              {mode}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2 pb-1 pt-1 text-[10.5px] font-medium text-[var(--color-text-dim)]">
      {children}
    </p>
  );
}

export function ChatOptionsMenu({
  open,
  onClose,
  enhancedMode,
  onEnhancedModeChange,
  webSearchEnabled,
  onWebSearchChange,
  webSearchDisabled = false,
  webSearchDisabledReason,
  codeExecutionEnabled,
  onCodeExecutionChange,
  codeExecutionDisabled = false,
  codeExecutionDisabledReason,
}: ChatOptionsMenuProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "skills">("chat");
  const speedPreset = useSettingsStore((s) => s.webSearchSpeedPreset);
  const interactiveAnswersEnabled = useSettingsStore((s) => s.interactiveAnswersEnabled);
  const setInteractiveAnswersEnabled = useSettingsStore((s) => s.setInteractiveAnswersEnabled);
  const artifactsEnabled = useSettingsStore((s) => s.artifactsEnabled);
  const setArtifactsEnabled = useSettingsStore((s) => s.setArtifactsEnabled);
  const webSearchOn = webSearchEnabled && !webSearchDisabled;
  const webSearchIconClass = speedPreset === "fast" ? "text-cyan-300" : "text-emerald-300";

  return (
    <DialogSurface
      open={open}
      onClose={onClose}
      ariaLabel="Chat settings"
      panelClassName="flex max-h-[80vh] w-[380px] max-w-[90vw] flex-col overflow-hidden rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] shadow-2xl"
    >
      <header className="flex items-start justify-between border-b border-white/10 px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-white">Chat settings</h3>
          <p className="mt-0.5 text-[10.5px] text-[var(--color-text-dim)]">
            Conversation behavior and tools for this chat
          </p>
        </div>
        <button
          type="button"
          aria-label="Close chat settings"
          onClick={onClose}
          className="grid size-6 shrink-0 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          <X className="size-4" />
        </button>
      </header>

      <div role="tablist" aria-label="Chat settings sections" className="flex gap-1 border-b border-white/10 px-2 pt-2">
        {([ ["chat", "Chat"], ["skills", "Skills & MCP"] ] as const).map(([tab, label]) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-t-md border-b-2 px-3 py-2 text-[11px] font-medium transition-colors ${activeTab === tab ? "border-[var(--color-accent)] text-white" : "border-transparent text-[var(--color-text-dim)] hover:text-white"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 scrollbar-thin">
        {activeTab === "chat" ? (
          <div id="chat-settings-panel" role="tabpanel" aria-label="Chat">
            <SectionLabel>Conversation</SectionLabel>
            <SettingRow
              icon={<Zap className="size-4" />}
              label="Enhanced"
              description="More tool rounds, notes, and follow-up questions"
              active={enhancedMode}
              onToggle={onEnhancedModeChange}
            />
            {enhancedMode && (
              <div className="ml-4 border-l border-white/[0.08] pl-2">
                <SettingRow
                  icon={<LayoutDashboard className="size-4" />}
                  label="Interactive answers"
                  description="Let AI compose charts, tools, diagrams, and explainers"
                  active={interactiveAnswersEnabled}
                  onToggle={setInteractiveAnswersEnabled}
                  iconActiveClass="text-violet-300"
                />
              </div>
            )}

            <div className="mx-2 my-1.5 h-px bg-white/[0.06]" />

            <SectionLabel>Tools</SectionLabel>
            <SettingRow
              icon={<FileText className="size-4" />}
              label="Artifacts"
              description="Create visual outputs, documents, and downloadable code"
              active={artifactsEnabled}
              onToggle={setArtifactsEnabled}
              iconActiveClass="text-violet-300"
            />
            {onWebSearchChange && (
              <>
                <SettingRow
                  icon={<Globe className="size-4" />}
                  label="Web search"
                  description="Search the web when needed"
                  active={webSearchOn}
                  onToggle={onWebSearchChange}
                  iconActiveClass={webSearchIconClass}
                  disabled={webSearchDisabled}
                  disabledReason={webSearchDisabledReason}
                />
                <SearchSpeedToggle on={webSearchOn} />
              </>
            )}
            {onCodeExecutionChange && (
              <SettingRow
                icon={<TerminalSquare className="size-4" />}
                label="Code execution"
                description="Run Python for calculations and data"
                active={codeExecutionEnabled}
                onToggle={onCodeExecutionChange}
                iconActiveClass="text-amber-300"
                disabled={codeExecutionDisabled}
                disabledReason={codeExecutionDisabledReason}
              />
            )}
          </div>
        ) : (
          <div id="skills-settings-panel" role="tabpanel" aria-label="Skills and MCP">
            <ChatExtensionsSettings />
          </div>
        )}
      </div>
    </DialogSurface>
  );
}
