import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import { formatStudioDiagnosticsForFeedback } from "@/modules/chat/studio/studio-diagnostics";

export function StudioSettingsSection() {
  const studioModeEnabled = useSettingsStore((s) => s.studioModeEnabled);
  const setStudioModeEnabled = useSettingsStore((s) => s.setStudioModeEnabled);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(formatStudioDiagnosticsForFeedback());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 2000);
  };

  return (
    <div className="space-y-3">
      <Toggle label="Enable Studio Mode" on={studioModeEnabled} onChange={setStudioModeEnabled} />
      <p className="text-[11px] text-[var(--color-text-dim)]">
        Available for plain chat conversations. Choose Studio Chat when creating a conversation to render
        isolated HTML and CSS visual responses inline in the transcript. Character and group chats stay on
        Standard for now.
      </p>
      <div className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-[var(--color-text)]">Local diagnostics</p>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
              Optional feedback summary with validation issue codes and snapshot-size counters. Never includes
              generated HTML or CSS.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            className="shrink-0 rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-[var(--color-text-dim)] hover:border-white/[0.14] hover:text-white"
          >
            {copyState === "copied" ? "Copied" : copyState === "failed" ? "Copy failed" : "Copy for feedback"}
          </button>
        </div>
      </div>
    </div>
  );
}
