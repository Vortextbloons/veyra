import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FolderOpen, Loader2, Search } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { Toggle } from "@/components/toggle";
import { SliderControl } from "@/components/ui/slider-control";
import { useSettingsStore } from "@/stores/settings-store";
import { invokeCheckPythonAvailable } from "@/lib/code-execution";
import { CollapsibleSettingsSection } from "./collapsible-settings-section";

type PythonStatus = {
  available: boolean;
  resolvedPath: string | null;
  source: string | null;
  version: string | null;
  message: string | null;
} | null;

export function CodeExecutionSettings() {
  const codeExecutionEnabled = useSettingsStore((s) => s.codeExecutionEnabled);
  const setCodeExecutionEnabled = useSettingsStore((s) => s.setCodeExecutionEnabled);
  const customPythonPath = useSettingsStore((s) => s.customPythonPath);
  const setCustomPythonPath = useSettingsStore((s) => s.setCustomPythonPath);
  const codeExecutionTimeoutSecs = useSettingsStore((s) => s.codeExecutionTimeoutSecs);
  const setCodeExecutionTimeoutSecs = useSettingsStore((s) => s.setCodeExecutionTimeoutSecs);

  const [status, setStatus] = useState<PythonStatus>(null);
  const [checking, setChecking] = useState(false);
  const [statusError, setStatusError] = useState("");
  const customPythonPathRef = useRef(customPythonPath);

  useEffect(() => {
    customPythonPathRef.current = customPythonPath;
  }, [customPythonPath]);

  const checkPython = useCallback(
    async (options?: { path?: string; persistDetectedPath?: boolean }) => {
      const candidatePath = options?.path ?? customPythonPathRef.current;
      setChecking(true);
      setStatusError("");
      try {
        const result = await invokeCheckPythonAvailable(candidatePath);
        setStatus(result);
        if (result.available && options?.persistDetectedPath && result.resolvedPath) {
          setCustomPythonPath(result.resolvedPath);
        }
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setStatus(null);
        setStatusError(message);
        return null;
      } finally {
        setChecking(false);
      }
    },
    [setCustomPythonPath],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void checkPython();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [checkPython]);

  const handleBrowse = async () => {
    try {
      const selected = await open({
        multiple: false,
        directory: false,
        title: "Select Python executable",
        filters: [{ name: "Python executable", extensions: ["exe", "cmd", "bat"] }],
      });
      if (typeof selected !== "string" || !selected.trim()) return;
      setCustomPythonPath(selected);
      void checkPython({ path: selected, persistDetectedPath: false });
    } catch {
      // dialog cancelled or unavailable
    }
  };

  const handleAutoDetect = async () => {
    const result = await checkPython({ path: customPythonPath, persistDetectedPath: true });
    if (result?.available && result.resolvedPath) {
      setCustomPythonPath(result.resolvedPath);
    }
  };

  const detectedLabel = status
    ? status.available
      ? `${status.resolvedPath ?? "Python found"}${status.version ? ` · ${status.version}` : ""}`
      : status.message ?? "Python not found"
    : "Python status not checked yet";

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3 text-[12px] text-[var(--color-text-dim)]">
        <p className="text-[12.5px] font-medium text-white">Local Python execution</p>
        <p className="mt-1 leading-relaxed">
          Snippets run in the app&apos;s current workspace, can read files, and may use the network when the machine is online. Dangerous imports and write helpers are blocked.
        </p>
      </section>

      <CollapsibleSettingsSection
        subsectionKey="codeExecution:execution"
        title="Execution"
        description="Set the default code execution state and point Veyra at a Python interpreter."
        keywords={["python", "enable", "path", "detect", "browse"]}
        defaultExpanded
      >
        <Toggle
          label="Enabled by default"
          on={codeExecutionEnabled}
          onChange={setCodeExecutionEnabled}
        />
        <p className="text-[11px] text-[var(--color-text-dim)]">
          Controls the default state. You can also toggle it per session from the right panel.
        </p>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium text-white">Python path</div>
              <p className="text-[11px] text-[var(--color-text-dim)]">
                Leave empty to auto-detect from PATH and common install locations.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => void handleAutoDetect()}
                disabled={checking}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white/[0.04] disabled:opacity-50"
              >
                {checking ? <Loader2 className="size-3.5 animate-spin" /> : <Search className="size-3.5" />}
                Detect
              </button>
              <button
                type="button"
                onClick={() => void handleBrowse()}
                className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-white/[0.04]"
              >
                <FolderOpen className="size-3.5" />
                Browse
              </button>
            </div>
          </div>

          <input
            value={customPythonPath}
            onChange={(e) => setCustomPythonPath(e.target.value)}
            placeholder="python, py -3, or full path to python.exe"
            className="mt-3 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 font-mono text-[11.5px] text-white outline-none placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)]/40"
          />

          <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[11px] text-[var(--color-text-dim)]">
            {statusError ? (
              <span className="inline-flex items-center gap-1.5 text-amber-300">
                <AlertTriangle className="size-3.5" />
                {statusError}
              </span>
            ) : status?.available ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <CheckCircle2 className="size-3.5" />
                {detectedLabel}
              </span>
            ) : (
              detectedLabel
            )}
          </div>
        </div>
      </CollapsibleSettingsSection>

      <CollapsibleSettingsSection
        subsectionKey="codeExecution:timeout"
        title="Timeout"
        description="How long Python code can run before Veyra stops it."
        keywords={["timeout", "seconds", "limit"]}
      >
        <SliderControl
          variant="card"
          label="Execution timeout"
          description="Long-running snippets will be stopped automatically."
          value={codeExecutionTimeoutSecs}
          min={5}
          max={300}
          step={5}
          formatValue={(value) => `${value}s`}
          onChange={setCodeExecutionTimeoutSecs}
        />
      </CollapsibleSettingsSection>
    </div>
  );
}
