import { useState } from "react";
import { useSettingsStore } from "@/stores/settings-store";
import { Toggle } from "@/components/toggle";
import { formatStudioDiagnosticsForFeedback } from "@/modules/chat/studio/studio-diagnostics";
import type { StudioPresentation } from "@/modules/chat/studio/studio-types";

export function StudioSettingsSection() {
  const studioModeEnabled = useSettingsStore((s) => s.studioModeEnabled);
  const setStudioModeEnabled = useSettingsStore((s) => s.setStudioModeEnabled);
  const presentation = useSettingsStore((s) => s.studioPresentation);
  const setPresentation = useSettingsStore((s) => s.setStudioPresentation);
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
        Available for plain chat conversations. Studio gives the assistant a persistent environment for
        explanations, charts, simulations, and creative experiences. Conversation stays available in a drawer.
        Controls and selections are saved locally. Character and group chats stay on Standard.
      </p>
      <label className="flex items-center justify-between gap-3 text-[11px] text-[var(--color-text)]">
        Presentation
        <select value={presentation} onChange={(event) => setPresentation(event.target.value as StudioPresentation)} className="rounded-md border border-white/10 bg-[var(--color-panel)] px-3 py-2 text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300">
          <option value="auto">Automatic</option><option value="calm">Calm</option><option value="expressive">Expressive</option>
        </select>
      </label>
      <p className="text-[10px] text-[var(--color-text-dim)]">Automatic adapts to your request. Calm keeps motion and styling restrained. Expressive invites more distinctive visuals.</p>
      <div className="rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-medium text-[var(--color-text)]">Local diagnostics</p>
            <p className="mt-0.5 text-[10px] text-[var(--color-text-dim)]">
              Optional feedback summary with validation issue codes and snapshot-size counters. Never includes
              generated HTML, CSS, or JavaScript.
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
