import { useEffect, useState, useCallback } from "react";
import {
  FlaskConical,
  Plus,
  Activity,
  LayoutList,
  BookOpen,
  ScanLine,
  ShieldAlert,
  FileText,
  History,
  Pause,
  Play,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useResearchStore } from "../research-store";
import { useSettingsStore } from "@/stores/settings-store";
import { ResearchRunCard } from "./ResearchRunCard";
import { ResearchPlanPanel } from "./ResearchPlanPanel";
import { ResearchRunTimeline } from "./ResearchRunTimeline";
import { ResearchSourceList } from "./ResearchSourceList";
import { EvidenceCardsPanel } from "./EvidenceCardsPanel";
import { ContradictionsPanel } from "./ContradictionsPanel";
import { ResearchReportViewer } from "./ResearchReportViewer";
import { ResearchFollowUpComposer } from "./ResearchFollowUpComposer";
import { NewResearchDialog } from "./NewResearchDialog";
import { enqueueResearchResume } from "../research-runtime";
import { useResearchElapsed } from "../use-research-elapsed";
import { Clock } from "lucide-react";
import {
  ResearchExtractionIndicators,
  resolveResearchExtraction,
  summarizeResearchExtractions,
} from "@/lib/source-extraction-ui";
import { isPdfUrl, isYouTubeUrl, isDocxUrl, isPptxUrl, isXlsxUrl, isEpubUrl } from "@/lib/url-classifiers";
import { ConfirmDangerModal } from "@/components/confirm-danger-modal";

const TAB_ITEMS = [
  { id: "plan", label: "Plan", icon: <LayoutList className="size-3.5" /> },
  { id: "timeline", label: "Timeline", icon: <History className="size-3.5" /> },
  { id: "sources", label: "Sources", icon: <BookOpen className="size-3.5" /> },
  { id: "evidence", label: "Evidence", icon: <ScanLine className="size-3.5" /> },
  { id: "contradictions", label: "Contradictions", icon: <ShieldAlert className="size-3.5" /> },
  { id: "report", label: "Report", icon: <FileText className="size-3.5" /> },
] as const;

type TabId = (typeof TAB_ITEMS)[number]["id"];

const DEPTH_LABELS = {
  lightning: "Lightning",
  quick: "Quick",
  standard: "Standard",
  deep: "Deep",
  exhaustive: "Exhaustive",
};

const DEPTH_BADGE = {
  lightning: "bg-yellow-500/10 text-yellow-300 border-yellow-500/20",
  quick: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  standard: "bg-blue-500/10 text-blue-300 border-blue-500/20",
  deep: "bg-amber-500/10 text-amber-300 border-amber-500/20",
  exhaustive: "bg-rose-500/10 text-rose-300 border-rose-500/20",
};

export function ResearchPage() {
  const hydrateRuns = useResearchStore((s) => s.hydrateRuns);
  const runs = useResearchStore((s) => s.runs);
  const activeRunId = useResearchStore((s) => s.activeRunId);
  const activeRun = useResearchStore((s) => s.activeRun);
  const setActiveRunId = useResearchStore((s) => s.setActiveRunId);
  const loadRun = useResearchStore((s) => s.loadRun);
  const deleteRun = useResearchStore((s) => s.deleteRun);
  const pauseActiveResearch = useResearchStore((s) => s.pauseActiveResearch);
  const isPausing = useResearchStore((s) => s.isPausing);

  const [activeTab, setActiveTab] = useState<TabId>("timeline");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [confirmDeleteRunId, setConfirmDeleteRunId] = useState<string | null>(null);

  useEffect(() => {
    void hydrateRuns();
  }, [hydrateRuns]);

  // Load full run data when activeRunId changes
  useEffect(() => {
    if (activeRunId) {
      void loadRun(activeRunId);
    }
  }, [activeRunId, loadRun]);



  const handleSelectRun = useCallback(
    (id: string) => {
      setActiveRunId(id);
      setActiveTab("timeline");
    },
    [setActiveRunId],
  );

  const handleDeleteRun = useCallback(
    async (id: string) => {
      await deleteRun(id);
      setConfirmDeleteRunId(null);
    },
    [deleteRun],
  );

  const run = activeRun?.run;
  const steps = activeRun?.steps ?? [];
  const sources = activeRun?.sources ?? [];
  const evidence = activeRun?.evidence ?? [];
  const claims = activeRun?.claims ?? [];
  const contradictions = activeRun?.contradictions ?? [];
  const report = activeRun?.report;

  const handleResume = useCallback(() => {
    if (!activeRunId) return;
    void enqueueResearchResume(activeRunId);
  }, [activeRunId]);

  const handlePause = useCallback(() => {
    pauseActiveResearch();
  }, [pauseActiveResearch]);

  const isActive = run && ["planning", "searching", "reading", "extracting", "verifying", "synthesizing"].includes(run.status);
  const canResume = run && (run.status === "paused" || run.status === "failed");
  const elapsed = useResearchElapsed(run);
  const extractionStats = summarizeResearchExtractions(sources);
  const pendingBundleSources =
    run?.status === "reading"
      ? sources.filter((source) => {
          if (resolveResearchExtraction(source)) return false;
          return (
            source.sourceType === "youtube" ||
            source.sourceType === "pdf" ||
            source.sourceType === "docx" ||
            source.sourceType === "pptx" ||
            source.sourceType === "xlsx" ||
            source.sourceType === "epub" ||
            isYouTubeUrl(source.url) ||
            isPdfUrl(source.url) ||
            isDocxUrl(source.url) ||
            isPptxUrl(source.url) ||
            isXlsxUrl(source.url) ||
            isEpubUrl(source.url)
          );
        }).length
      : 0;

  const firstRunNoticeDismissed = useSettingsStore((s) => s.researchFirstRunNoticeDismissed);
  const setFirstRunNoticeDismissed = useSettingsStore((s) => s.setResearchFirstRunNoticeDismissed);
  const showFirstRunBanner = !firstRunNoticeDismissed;

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      {showFirstRunBanner && (
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-2.5">
          <Sparkles className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
          <div className="flex-1 text-[11.5px] leading-relaxed text-amber-100/90">
            <span className="font-medium text-amber-100">Research is faster now.</span>{" "}
            Per-source validation, contradiction detection, and citation audit run in
            parallel and skip reasoning by default. Tune every knob in{" "}
            <span className="font-mono text-amber-200">Settings → Research</span>, or
            set a per-run override from the New Research dialog's "Advanced" panel.
          </div>
          <button
            type="button"
            onClick={() => setFirstRunNoticeDismissed(true)}
            className="grid size-5 shrink-0 place-items-center rounded text-amber-200/80 transition-colors hover:bg-amber-500/10 hover:text-amber-100"
            title="Dismiss"
          >
            <X className="size-3" />
          </button>
        </div>
      )}

      {/* Page header */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center text-[var(--color-text-dim)]">
            <FlaskConical className="size-4" />
          </div>
          <h1 className="text-[14px] font-semibold tracking-tight">Research</h1>
          <span className="ml-2 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
            {runs.length} total
          </span>
        </div>
        {runs.length > 0 && <button
          type="button"
          onClick={() => setShowNewDialog(true)}
          className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12px] font-medium text-white hover:brightness-110"
        >
          <Plus className="size-3.5" />
          New Research
        </button>}
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Left sidebar: run list */}
        {runs.length > 0 && <aside className="flex w-[300px] min-w-[260px] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--color-border)] px-3">
            <LayoutList className="size-3.5 text-[var(--color-text-dim)]" />
            <span className="text-[12px] font-medium text-[var(--color-text)]">
              Research Runs
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
              <div className="flex flex-col gap-2">
                {runs.map((r) => (
                  <ResearchRunCard
                    key={r.id}
                    run={r}
                    isActive={r.id === activeRunId}
                    onClick={() => handleSelectRun(r.id)}
                    onDelete={() => setConfirmDeleteRunId(r.id)}
                  />
                ))}
              </div>
          </div>
        </aside>}

        {/* Main area: detail view */}
        <section className="flex min-w-0 flex-1 flex-col">
          {!run ? (
            <WelcomeScreen onStart={() => setShowNewDialog(true)} />
          ) : (
            <>
              {/* Run header */}
              <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-5 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <h2 className="text-[15px] font-semibold leading-snug text-[var(--color-text)]">
                      {run.clarifiedQuestion || run.question}
                    </h2>
                    <p className="mt-0.5 text-[12px] text-[var(--color-text-dim)]">
                      {run.question}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${
                        DEPTH_BADGE[run.depth]
                      }`}
                    >
                      {DEPTH_LABELS[run.depth]}
                    </span>
                    <RunElapsedPill status={run.status} elapsed={elapsed} />
                    <RunStatusBadge status={run.status} />
                    {isActive && (
                      <button
                        type="button"
                        onClick={handlePause}
                        disabled={isPausing}
                        className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                        title="Pause research"
                      >
                        {isPausing ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Pause className="size-3" />
                        )}
                        {isPausing ? "Pausing…" : "Pause"}
                      </button>
                    )}
                    {canResume && (
                      <button
                        type="button"
                        onClick={handleResume}
                        className="flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                        title="Resume research"
                      >
                        <Play className="size-3" />
                        Resume
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress bar */}
                <LiveProgressBar
                  status={run.status}
                  percent={run.progressPercent}
                  pendingBundleSources={pendingBundleSources}
                />
                {(extractionStats.hasIndicators || pendingBundleSources > 0) && (
                  <div className="flex flex-wrap items-center gap-2">
                    <ResearchExtractionIndicators sources={sources} />
                    {pendingBundleSources > 0 && (
                      <span className="text-[10.5px] text-[var(--color-text-dim)]">
                        {pendingBundleSources} more document source
                        {pendingBundleSources !== 1 ? "s" : ""} fetching…
                      </span>
                    )}
                  </div>
                )}
                {(run.totalTokensUsed !== undefined && run.totalTokensUsed > 0) ||
                (run.completedAt && (run.status === "completed" || run.status === "failed")) ? (
                  <div className="flex items-center justify-end gap-3 text-[11px] text-[var(--color-text-dim)]">
                    {(run.status === "completed" || run.status === "failed") && run.completedAt && (
                      <span className="flex items-center gap-1" title="Total duration">
                        <Clock className="size-3" />
                        <span className="font-mono tabular-nums">{elapsed}</span>
                      </span>
                    )}
                    {run.totalTokensUsed !== undefined && run.totalTokensUsed > 0 && (
                      <span>{run.totalTokensUsed.toLocaleString()} tokens</span>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Tabs */}
              <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--color-border)] px-3">
                {TAB_ITEMS.map((tab) => {
                  const count = getTabCount(tab.id, sources, evidence, contradictions, report, run.plan);
                  const tabExtractionHint =
                    tab.id === "sources" && extractionStats.summary
                      ? extractionStats.summary
                      : null;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
                        activeTab === tab.id
                          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                          : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      {count > 0 && (
                        <span className="ml-0.5 rounded-full bg-white/[0.06] px-1.5 py-px text-[10px] text-[var(--color-text-dim)]">
                          {count}
                        </span>
                      )}
                      {tabExtractionHint && (
                        <span
                          className="ml-0.5 hidden text-[9.5px] text-rose-300/80 sm:inline"
                          title="Advanced Search Bundle extractions"
                        >
                          · {tabExtractionHint}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                {activeTab === "plan" && (
                  run.plan ? (
                    <ResearchPlanPanel plan={run.plan} runId={run.id} />
                  ) : (
                    <div className="flex items-center justify-center py-12 text-[12.5px] text-[var(--color-text-dim)]">
                      Plan not generated yet.
                    </div>
                  )
                )}
                {activeTab === "timeline" && <ResearchRunTimeline steps={steps} />}
                {activeTab === "sources" && <ResearchSourceList sources={sources} />}
                {activeTab === "evidence" && (
                  <EvidenceCardsPanel
                    evidence={evidence}
                    sources={sources.map((s) => ({ id: s.id, title: s.title, url: s.url }))}
                  />
                )}
                {activeTab === "contradictions" && (
                  <ContradictionsPanel
                    contradictions={contradictions}
                    claims={claims}
                    sources={sources}
                  />
                )}
                {activeTab === "report" &&
                  (report ? (
                    <ResearchReportViewer
                      report={report}
                      sources={sources}
                      evidence={evidence}
                      projectId={run?.projectId}
                    />
                  ) : (
                    <div className="flex items-center justify-center py-12 text-[12.5px] text-[var(--color-text-dim)]">
                      Report not generated yet.
                    </div>
                  ))}
              </div>

              {/* Follow-up composer (only when completed) */}
              {run.status === "completed" && (
                <ResearchFollowUpComposer previousRun={run} />
              )}
            </>
          )}
        </section>
      </div>

      {/* New research dialog */}
      {showNewDialog && (
        <NewResearchDialog onClose={() => setShowNewDialog(false)} />
      )}

      <ConfirmDangerModal
        open={confirmDeleteRunId != null}
        closeOnBackdrop={false}
        overlayClassName="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        panelClassName="w-full max-w-sm rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        titleClassName="text-[14px] font-semibold text-white"
        descriptionClassName="mt-2 text-[12.5px] leading-relaxed text-[var(--color-text-dim)]"
        actionsClassName="mt-5 flex justify-end gap-2"
        cancelButtonClassName="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-1.5 text-[12px] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-white"
        confirmButtonClassName="rounded-lg bg-red-500/15 px-3 py-1.5 text-[12px] font-medium text-red-300 hover:bg-red-500/25"
        title="Delete research run?"
        description="This will permanently delete the run, sources, evidence, claims, and report. This cannot be undone."
        onCancel={() => setConfirmDeleteRunId(null)}
        onConfirm={async () => {
          const id = confirmDeleteRunId;
          if (!id) return;
          await handleDeleteRun(id);
        }}
      />
    </main>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="w-full max-w-xl">
        <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-accent)]">
          Evidence-led research
        </p>
        <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.035em] text-white">
          Start with a question worth investigating.
        </h2>
        <p className="mt-3 max-w-lg text-[14px] leading-relaxed text-[var(--color-text-dim)]">
          Veyra builds a plan, reads across sources, checks contradictions, and produces a cited report you can inspect.
        </p>
        <div className="mt-7">
          <button
            type="button"
            onClick={onStart}
            className="flex min-h-9 items-center gap-2 rounded-md bg-[var(--color-accent)] px-4 text-[13px] font-medium text-white hover:brightness-110"
          >
            <Plus className="size-4" />
            New Research
          </button>
        </div>
      </div>
    </div>
  );
}

function RunStatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; classes: string }> = {
    planning: { label: "Planning", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
    searching: { label: "Searching", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
    reading: { label: "Reading", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
    extracting: { label: "Extracting", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
    verifying: { label: "Verifying", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
    synthesizing: { label: "Writing", classes: "border-amber-500/20 bg-amber-500/10 text-amber-300" },
    completed: { label: "Completed", classes: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" },
    failed: { label: "Failed", classes: "border-red-500/20 bg-red-500/10 text-red-300" },
    paused: { label: "Paused", classes: "border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-dim)]" },
  };
  const config = configs[status] ?? { label: status, classes: "border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-dim)]" };

  return (
    <span className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium ${config.classes}`}>
      <Activity className="size-3" />
      {config.label}
    </span>
  );
}

function RunElapsedPill({ status, elapsed }: { status: string; elapsed: string }) {
  const isLive = ["planning", "searching", "reading", "extracting", "verifying", "synthesizing"].includes(status);
  const isTerminal = status === "completed" || status === "failed";
  const classes = isLive
    ? "border-indigo-500/30 bg-indigo-500/10 text-indigo-200"
    : isTerminal
      ? "border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-dim)]"
      : "border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-dim)]";
  return (
    <span
      className={`flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums ${classes}`}
      title={isLive ? "Elapsed time" : "Total duration"}
    >
      <Clock className={`size-3 ${isLive ? "animate-pulse text-indigo-300" : ""}`} />
      {elapsed}
    </span>
  );
}

function getTabCount(
  tabId: TabId,
  sources: unknown[],
  evidence: unknown[],
  contradictions: unknown[],
  report: unknown,
  plan?: unknown,
): number {
  switch (tabId) {
    case "plan":
      return plan ? 1 : 0;
    case "sources":
      return sources.length;
    case "evidence":
      return evidence.length;
    case "contradictions":
      return contradictions.length;
    case "report":
      return report ? 1 : 0;
    default:
      return 0;
  }
}

function LiveProgressBar({
  status,
  percent,
  pendingBundleSources = 0,
}: {
  status: string;
  percent: number;
  pendingBundleSources?: number;
}) {
  const validateProgress = useResearchStore((s) => s.validateProgress);
  const extractProgress = useResearchStore((s) => s.extractProgress);
  const contradictionProgress = useResearchStore((s) => s.contradictionProgress);
  const auditProgress = useResearchStore((s) => s.auditProgress);

  const isActive = status !== "completed" && status !== "failed" && status !== "paused";

  // Pick the most relevant in-flight phase indicator.
  let phaseLabel: string | null = null;
  let phasePct: number | null = null;
  if (validateProgress.total > 0 && (validateProgress.done < validateProgress.total || percent < 50)) {
    phaseLabel = "Validating sources";
    phasePct = validateProgress.total > 0
      ? Math.floor((validateProgress.done / validateProgress.total) * 100)
      : null;
  } else if (extractProgress.total > 0 && (extractProgress.done < extractProgress.total || percent < 65)) {
    phaseLabel = "Extracting evidence";
    phasePct = extractProgress.total > 0
      ? Math.floor((extractProgress.done / extractProgress.total) * 100)
      : null;
  } else if (contradictionProgress.total > 0 && (contradictionProgress.done < contradictionProgress.total || percent < 80)) {
    phaseLabel = "Detecting contradictions";
    phasePct = contradictionProgress.total > 0
      ? Math.floor((contradictionProgress.done / contradictionProgress.total) * 100)
      : null;
  } else if (auditProgress.total > 0 && (auditProgress.done < auditProgress.total || percent < 95)) {
    phaseLabel = "Auditing citations";
    phasePct = auditProgress.total > 0
      ? Math.floor((auditProgress.done / auditProgress.total) * 100)
      : null;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              status === "failed"
                ? "bg-red-500/60"
                : status === "completed"
                  ? "bg-emerald-500/60"
                  : "bg-amber-500/60"
            }`}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span className="text-[11px] font-mono text-[var(--color-text-dim)]">
          {percent}%
        </span>
      </div>
      {isActive && phaseLabel && phasePct !== null && (
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-dim)]">
          <Loader2 className="size-3 animate-spin text-amber-400" />
          <span>{phaseLabel}</span>
          <span className="font-mono text-amber-300">{phasePct}%</span>
        </div>
      )}
      {status === "reading" && pendingBundleSources > 0 && (
        <div className="flex items-center gap-2 text-[10.5px] text-[var(--color-text-dim)]">
          <Loader2 className="size-3 animate-spin text-rose-300" />
          <span>
            Advanced Search Bundle: extracting document content…
          </span>
        </div>
      )}
    </div>
  );
}
