import { useEffect, useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { useProviderStore } from "@/stores/provider-store";
import { Toggle } from "@/components/toggle";
import { ModelDropdown } from "./model-dropdown";
import { emailAiWorker } from "@/modules/email/email-ai-worker";
import {
  startEmailAiWorker,
  stopEmailAiWorker,
  useEmailStore,
} from "@/modules/email/email-store";
import { emailReconcileAiJobs } from "@/modules/email/tauri-commands";

const POLL_OPTIONS = [
  { label: "30s", value: 30000 },
  { label: "1 min", value: 60000 },
  { label: "2 min", value: 120000 },
  { label: "5 min", value: 300000 },
];

export function EmailSettings() {
  const models = useProviderStore((s) => s.models);

  const emailAiEnabled = useSettingsStore((s) => s.emailAiEnabled);
  const setEmailAiEnabled = useSettingsStore((s) => s.setEmailAiEnabled);
  const emailAiAutoDraft = useSettingsStore((s) => s.emailAiAutoDraft);
  const setEmailAiAutoDraft = useSettingsStore((s) => s.setEmailAiAutoDraft);
  const emailAiWorkerCount = useSettingsStore((s) => s.emailAiWorkerCount);
  const setEmailAiWorkerCount = useSettingsStore((s) => s.setEmailAiWorkerCount);
  const emailAiBackgroundSummary = useSettingsStore((s) => s.emailAiBackgroundSummary);
  const setEmailAiBackgroundSummary = useSettingsStore((s) => s.setEmailAiBackgroundSummary);
  const emailAiBackgroundClassification = useSettingsStore(
    (s) => s.emailAiBackgroundClassification,
  );
  const setEmailAiBackgroundClassification = useSettingsStore(
    (s) => s.setEmailAiBackgroundClassification,
  );
  const emailAiBackgroundSpam = useSettingsStore((s) => s.emailAiBackgroundSpam);
  const setEmailAiBackgroundSpam = useSettingsStore((s) => s.setEmailAiBackgroundSpam);
  const emailAiBackgroundUrgency = useSettingsStore((s) => s.emailAiBackgroundUrgency);
  const setEmailAiBackgroundUrgency = useSettingsStore((s) => s.setEmailAiBackgroundUrgency);
  const emailAiPollInterval = useSettingsStore((s) => s.emailAiPollInterval);
  const setEmailAiPollInterval = useSettingsStore((s) => s.setEmailAiPollInterval);
  const emailAiSummaryModel = useSettingsStore((s) => s.emailAiSummaryModel);
  const setEmailAiSummaryModel = useSettingsStore((s) => s.setEmailAiSummaryModel);
  const emailAiClassificationModel = useSettingsStore((s) => s.emailAiClassificationModel);
  const setEmailAiClassificationModel = useSettingsStore(
    (s) => s.setEmailAiClassificationModel,
  );
  const emailAiDraftModel = useSettingsStore((s) => s.emailAiDraftModel);
  const setEmailAiDraftModel = useSettingsStore((s) => s.setEmailAiDraftModel);

  const workerStatus = useEmailAiWorkerStatus();
  const resetEmailAi = useEmailStore((s) => s.resetEmailAi);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (emailAiEnabled) {
      void emailReconcileAiJobs(0);
    }
  }, [emailAiEnabled]);

  const handleEmailAiEnabled = (enabled: boolean) => {
    setEmailAiEnabled(enabled);
    if (enabled) {
      startEmailAiWorker();
    } else {
      stopEmailAiWorker();
    }
  };

  const handleResetEmailAi = () => {
    if (
      !window.confirm(
        "Reset all Email AI data? This clears queued jobs, analysis results, AI drafts, and AI-applied tags, and restores Email AI settings to defaults. Your emails and accounts are not affected.",
      )
    ) {
      return;
    }
    setResetting(true);
    void resetEmailAi().finally(() => setResetting(false));
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Email AI
        </h2>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Toggle
              label="Enable Email AI"
              on={emailAiEnabled}
              onChange={handleEmailAiEnabled}
            />
          </div>
          <p className="text-[11px] text-[var(--color-text-dim)]">
            Process emails with AI after sync and support on-demand draft generation in the
            Email module.
          </p>
        </div>
      </section>

      {emailAiEnabled && (
        <>
          <section>
            <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
              Background tasks
            </h2>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Toggle
                  label="Thread summaries"
                  on={emailAiBackgroundSummary}
                  onChange={setEmailAiBackgroundSummary}
                />
                <Toggle
                  label="Classification"
                  on={emailAiBackgroundClassification}
                  onChange={setEmailAiBackgroundClassification}
                />
                <Toggle
                  label="Spam detection"
                  on={emailAiBackgroundSpam}
                  onChange={setEmailAiBackgroundSpam}
                />
                <Toggle
                  label="Urgency scoring"
                  on={emailAiBackgroundUrgency}
                  onChange={setEmailAiBackgroundUrgency}
                />
              </div>
              <p className="text-[11px] text-[var(--color-text-dim)]">
                Background tasks run after Gmail sync. On-demand draft generation works
                independently of auto-draft.
              </p>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
              Drafts
            </h2>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Toggle
                  label="Auto-draft replies"
                  on={emailAiAutoDraft}
                  onChange={setEmailAiAutoDraft}
                />
              </div>
              <p className="text-[11px] text-[var(--color-text-dim)]">
                Automatically queue draft replies for new threads after sync. You can also
                generate drafts manually from any thread.
              </p>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-2">
                  <div className="text-[12.5px] font-medium text-white">Draft model</div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Model used for reply drafts. Leave empty to use the currently selected
                    model.
                  </div>
                </div>
                <ModelDropdown
                  models={models}
                  value={emailAiDraftModel}
                  onChange={setEmailAiDraftModel}
                  placeholder="Use selected model"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
              Models
            </h2>
            <div className="space-y-3">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-2">
                  <div className="text-[12.5px] font-medium text-white">Summary model</div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Used for thread summaries and urgency scoring.
                  </div>
                </div>
                <ModelDropdown
                  models={models}
                  value={emailAiSummaryModel}
                  onChange={setEmailAiSummaryModel}
                  placeholder="Use selected model"
                />
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-2">
                  <div className="text-[12.5px] font-medium text-white">
                    Classification model
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Used for categorization, tagging, and spam scoring.
                  </div>
                </div>
                <ModelDropdown
                  models={models}
                  value={emailAiClassificationModel}
                  onChange={setEmailAiClassificationModel}
                  placeholder="Use selected model"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
              Performance
            </h2>
            <div className="space-y-4">
              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-3">
                  <div className="text-[12.5px] font-medium text-white">
                    Worker batch size
                  </div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    Jobs processed per model load cycle.
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => {
                        setEmailAiWorkerCount(n);
                        emailAiWorker.applyRuntimeSettings();
                        emailAiWorker.wake();
                      }}
                      className={`grid size-8 place-items-center rounded-md text-[12px] font-medium transition ${
                        emailAiWorkerCount === n
                          ? "bg-[var(--color-accent)] text-white"
                          : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                <div className="mb-3">
                  <div className="text-[12.5px] font-medium text-white">Poll interval</div>
                  <div className="text-[11px] text-[var(--color-text-dim)]">
                    How often the worker checks for queued jobs.
                  </div>
                </div>
                <select
                  value={emailAiPollInterval}
                  onChange={(e) => {
                    setEmailAiPollInterval(Number(e.target.value));
                    emailAiWorker.applyRuntimeSettings();
                  }}
                  className="h-8 w-full max-w-xs rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[12px] text-[var(--color-text)]"
                >
                  {POLL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {workerStatus.running && (
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
                  <div className="flex items-center gap-2 text-[12px]">
                    <div
                      className={`size-1.5 rounded-full ${
                        workerStatus.processingJob
                          ? "animate-pulse bg-sky-400"
                          : "bg-emerald-400"
                      }`}
                    />
                    <span className="text-[var(--color-text)]">
                      {workerStatus.processingJob ? "Processing job" : "Worker ready"}
                    </span>
                    {workerStatus.processingJob && (
                      <span className="text-[var(--color-text-dim)]">
                        — {workerStatus.processingJob.taskType}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 flex gap-4 text-[11px] text-[var(--color-text-dim)]">
                    <span>{workerStatus.jobsCompleted} completed</span>
                    <span>{workerStatus.jobsFailed} failed</span>
                  </div>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      <section>
        <h2 className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-wider text-[var(--color-text-dim)]">
          Data
        </h2>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="text-[12.5px] font-medium text-white">Reset Email AI</div>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-text-dim)]">
            Clear all AI jobs, summaries, classifications, drafts, and AI tags. Restores
            Email AI settings to defaults. Does not delete your emails or connected accounts.
          </p>
          <button
            type="button"
            onClick={handleResetEmailAi}
            disabled={resetting}
            className="mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-[11.5px] font-medium text-red-300 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {resetting ? "Resetting…" : "Reset all Email AI data"}
          </button>
        </div>
      </section>
    </div>
  );
}

function useEmailAiWorkerStatus() {
  const [status, setStatus] = useState(emailAiWorker.getStatus());
  useEffect(() => emailAiWorker.subscribe(setStatus), []);
  return status;
}
