import { useState } from "react";
import type { ToolCallState } from "@/lib/chat-types";
import {
  getToolCallUi,
  isToolCallActive,
  TOOL_CALL_ACCENT_STYLES,
  toolCallPhaseLabel,
} from "@/lib/tool-call-ui";
import { ToolCallShell } from "@/components/chat/tool-call-shell";

export type ToolCallIndicatorProps = {
  state: ToolCallState;
};

export function ToolCallIndicator({ state }: ToolCallIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolCallUi(state.name, state.label);
  const Icon = meta.icon;
  const isActive = isToolCallActive(state.phase);
  const isError = state.phase === "error";
  const isDone = state.phase === "done";
  const hasDetails = Boolean(state.detail || state.error);

  return (
    <ToolCallShell
      icon={<Icon className={`size-3 ${TOOL_CALL_ACCENT_STYLES[meta.accent].text}`} />}
      label={state.label || meta.label}
      phaseLabel={toolCallPhaseLabel(state.phase, state.attempts)}
      accent={meta.accent}
      isActive={isActive}
      isError={isError}
      isDone={isDone}
      inputPreview={state.input || (isDone ? state.detail : undefined)}
      expandable={hasDetails}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      {expanded && hasDetails && (
        <div
          className={`mt-1 rounded-lg border px-3 py-2 text-[11.5px] ${
            isError
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : "border-[var(--color-border)] bg-[var(--color-panel)]/50 text-[var(--color-text-dim)]"
          }`}
        >
          {state.error || state.detail}
        </div>
      )}
    </ToolCallShell>
  );
}
