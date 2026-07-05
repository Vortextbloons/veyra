import { useState, useRef, useEffect } from "react";
import {
  Settings,
  X,
  Bot,
  Mail,
  Shield,
  Gauge,
  Tag,
  AlertTriangle,
} from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { emailAiWorker } from "../email-ai-worker";
import { startEmailAiWorker, stopEmailAiWorker } from "../email-store";

const POLL_OPTIONS = [
  { label: "30s", value: 30000 },
  { label: "1 min", value: 60000 },
  { label: "2 min", value: 120000 },
  { label: "5 min", value: 300000 },
];

export function EmailAiSettingsPanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Email AI settings"
      >
        <Settings className="size-3.5" />
      </button>
      {open && <EmailAiSettingsPopover onClose={() => setOpen(false)} />}
    </div>
  );
}

function EmailAiSettingsPopover({ onClose }: { onClose: () => void }) {
  const settings = useSettingsStore();
  const workerStatus = useEmailStore_status();

  return (
    <div className="absolute right-0 top-9 z-50 w-80 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <Bot className="size-4 text-[var(--color-accent)]" />
          <span className="text-[13px] font-semibold text-[var(--color-text)]">
            Email AI
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:text-white"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
        {/* Master toggle */}
        <ToggleRow
          icon={<Bot className="size-3.5" />}
          label="Email AI enabled"
          description="Process emails with AI after sync"
          checked={settings.emailAiEnabled}
          onChange={(enabled) => {
            settings.setEmailAiEnabled(enabled);
            if (enabled) {
              startEmailAiWorker();
            } else {
              stopEmailAiWorker();
            }
          }}
        />

        {settings.emailAiEnabled && (
          <>
            {/* Task toggles */}
            <SectionLabel label="Background tasks" />
            <ToggleRow
              icon={<Mail className="size-3.5" />}
              label="Thread summaries"
              description="Summarize email threads"
              checked={settings.emailAiBackgroundSummary}
              onChange={settings.setEmailAiBackgroundSummary}
            />
            <ToggleRow
              icon={<Tag className="size-3.5" />}
              label="Classification"
              description="Auto-categorize and tag emails"
              checked={settings.emailAiBackgroundClassification}
              onChange={settings.setEmailAiBackgroundClassification}
            />
            <ToggleRow
              icon={<Shield className="size-3.5" />}
              label="Spam detection"
              description="Score spam and marketing content"
              checked={settings.emailAiBackgroundSpam}
              onChange={settings.setEmailAiBackgroundSpam}
            />
            <ToggleRow
              icon={<AlertTriangle className="size-3.5" />}
              label="Urgency scoring"
              description="Flag time-sensitive emails"
              checked={settings.emailAiBackgroundUrgency}
              onChange={settings.setEmailAiBackgroundUrgency}
            />

            {/* Worker count */}
            <SectionLabel label="Performance" />
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-[var(--color-text)]">
                  Worker batch size
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  Jobs per model load cycle
                </div>
              </div>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => settings.setEmailAiWorkerCount(n)}
                    className={`grid size-7 place-items-center rounded-md text-[12px] font-medium transition ${
                      settings.emailAiWorkerCount === n
                        ? "bg-[var(--color-accent)] text-white"
                        : "bg-white/5 text-[var(--color-text-dim)] hover:bg-white/10"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* Poll interval */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[12px] text-[var(--color-text)]">
                  Poll interval
                </div>
                <div className="text-[11px] text-[var(--color-text-dim)]">
                  How often to check for new jobs
                </div>
              </div>
              <select
                value={settings.emailAiPollInterval}
                onChange={(e) => {
                  settings.setEmailAiPollInterval(Number(e.target.value));
                  emailAiWorker.restartPollTimer();
                }}
                className="h-7 rounded-md border border-[var(--color-border)] bg-black/20 px-2 text-[12px] text-[var(--color-text)]"
              >
                {POLL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Auto-draft */}
            <ToggleRow
              icon={<Gauge className="size-3.5" />}
              label="Auto-draft replies"
              description="Generate draft replies automatically (disabled by default)"
              checked={settings.emailAiAutoDraft}
              onChange={settings.setEmailAiAutoDraft}
            />

            {/* Worker status */}
            {workerStatus.running && (
              <div className="rounded-lg border border-[var(--color-border)] bg-white/[0.02] p-3">
                <div className="flex items-center gap-2 text-[11px]">
                  <div className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[var(--color-text-dim)]">
                    Worker active
                  </span>
                  {workerStatus.processingJob && (
                    <span className="text-[var(--color-text-dim)]">
                      — {workerStatus.processingJob.taskType}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex gap-3 text-[10px] text-[var(--color-text-dim)]">
                  <span>{workerStatus.jobsCompleted} completed</span>
                  <span>{workerStatus.jobsFailed} failed</span>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ToggleRow({
  icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg p-2 text-left hover:bg-white/[0.03] transition"
    >
      <div className="mt-0.5 text-[var(--color-text-dim)]">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[12px] text-[var(--color-text)]">{label}</div>
        <div className="text-[11px] text-[var(--color-text-dim)]">
          {description}
        </div>
      </div>
      <div
        className={`mt-0.5 h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors ${
          checked
            ? "bg-[var(--color-accent)]"
            : "bg-white/10"
        }`}
      >
        <div
          className={`size-4 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
    </button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]/60">
      {label}
    </div>
  );
}

function useEmailStore_status() {
  const [status, setStatus] = useState(emailAiWorker.getStatus());
  useEffect(() => {
    return emailAiWorker.subscribe(setStatus);
  }, []);
  return status;
}
