import { useState } from "react";
import { Code2 } from "lucide-react";
import type { ToolCallState } from "@/lib/chat-types";
import { HighlightedCode } from "@/components/ui/highlighted-code";
import {
  getToolCallUi,
  isToolCallActive,
  TOOL_CALL_ACCENT_STYLES,
  toolCallPhaseLabel,
} from "@/lib/tool-call-ui";
import { ToolCallShell } from "@/components/chat/tool-call-shell";

type CodeExecutionResult = {
  code: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  pythonPath: string;
  durationMs: number;
  workingDirectory: string;
};

function isCodeExecutionResult(value: unknown): value is CodeExecutionResult {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CodeExecutionResult>;
  return (
    typeof candidate.code === "string" &&
    typeof candidate.stdout === "string" &&
    typeof candidate.stderr === "string" &&
    (typeof candidate.exitCode === "number" || candidate.exitCode === null) &&
    typeof candidate.timedOut === "boolean" &&
    typeof candidate.pythonPath === "string" &&
    typeof candidate.durationMs === "number" &&
    typeof candidate.workingDirectory === "string"
  );
}

function OutputBlock({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "error" }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-dim)]/70">
        {label}
      </div>
      <pre
        className={`max-h-72 overflow-auto rounded-md border px-3 py-2 text-[11px] leading-relaxed ${
          tone === "error"
            ? "border-red-500/20 bg-red-500/[0.06] text-red-200"
            : "border-[var(--color-border)] bg-black/20 text-[var(--color-text)]"
        }`}
      >
        <code>{value.trim() || "(empty)"}</code>
      </pre>
    </div>
  );
}

export function CodeExecutionBlock({ state }: { state: ToolCallState }) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolCallUi(state.name, state.label);
  const result = isCodeExecutionResult(state.result) ? state.result : null;
  const isActive = isToolCallActive(state.phase);
  const isError = state.phase === "error";
  const isDone = state.phase === "done";
  const Icon = meta.icon || Code2;
  const exitSummary = result
    ? `Exit ${result.exitCode ?? "unknown"}${result.timedOut ? " · timed out" : ""} · ${result.durationMs}ms`
    : state.detail;
  const codePreview = result?.code.replace(/\s+/g, " ").trim() || state.input;
  const inputPreview = [codePreview ? `Code: ${codePreview}` : null, exitSummary]
    .filter(Boolean)
    .join(" · ");

  return (
    <ToolCallShell
      icon={<Icon className={`size-3 ${TOOL_CALL_ACCENT_STYLES[meta.accent].text}`} />}
      label={state.label || meta.label}
      phaseLabel={toolCallPhaseLabel(state.phase, state.attempts)}
      accent={meta.accent}
      isActive={isActive}
      isError={isError}
      isDone={isDone}
      inputPreview={inputPreview || state.input}
      expandable={Boolean(result || state.detail || state.error)}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      {expanded && result && (
        <div className="mt-2 space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/50 p-3">
          <div className="grid gap-2 text-[10.5px] text-[var(--color-text-dim)] sm:grid-cols-2">
            <div>Python: <span className="font-mono text-[var(--color-text)]">{result.pythonPath}</span></div>
            <div>Duration: <span className="font-mono text-[var(--color-text)]">{result.durationMs}ms</span></div>
            <div>Exit: <span className="font-mono text-[var(--color-text)]">{result.exitCode ?? "unknown"}</span></div>
            <div className="truncate">CWD: <span className="font-mono text-[var(--color-text)]">{result.workingDirectory}</span></div>
          </div>
          <div>
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-dim)]/70">
              Code
            </div>
            <HighlightedCode code={result.code} language="python" />
          </div>
          <OutputBlock label="Stdout" value={result.stdout} />
          <OutputBlock label="Stderr" value={result.stderr} tone={result.stderr.trim() ? "error" : "default"} />
        </div>
      )}
      {expanded && !result && (state.error || state.detail) && (
        <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)]/50 px-3 py-2 text-[11.5px] text-[var(--color-text-dim)]">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {state.detail || state.error}
          </pre>
        </div>
      )}
    </ToolCallShell>
  );
}
