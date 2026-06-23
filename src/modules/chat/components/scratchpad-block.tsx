import { useState } from "react";
import { NotepadText } from "lucide-react";
import type { ToolCallState } from "@/modules/chat/chat-types";
import {
  getToolCallUi,
  isToolCallActive,
  TOOL_CALL_ACCENT_STYLES,
  toolCallPhaseLabel,
} from "@/lib/tool-call-ui";
import { ToolCallShell } from "@/modules/chat/components/tool-call-shell";

type ScratchpadBlockProps = {
  state: ToolCallState;
  scratchpadContent?: string;
};

export function ScratchpadBlock({ state, scratchpadContent }: ScratchpadBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const meta = getToolCallUi(state.name, state.label);
  const Icon = meta.icon || NotepadText;
  const isActive = isToolCallActive(state.phase);
  const isError = state.phase === "error";
  const isDone = state.phase === "done";
  const content = scratchpadContent ?? (typeof state.result === "string" ? state.result : "");

  return (
    <ToolCallShell
      icon={<Icon className={`size-3 ${TOOL_CALL_ACCENT_STYLES[meta.accent].text}`} />}
      label={state.label || meta.label}
      phaseLabel={toolCallPhaseLabel(state.phase, state.attempts)}
      accent={meta.accent}
      isActive={isActive}
      isError={isError}
      isDone={isDone}
      inputPreview={state.input}
      expandable={Boolean(content)}
      expanded={expanded}
      onToggle={() => setExpanded((v) => !v)}
    >
      {expanded && content && (
        <div className="mt-2 rounded-lg border border-violet-500/20 bg-violet-500/[0.04] p-3">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-violet-200/80">
            {content}
          </pre>
        </div>
      )}
    </ToolCallShell>
  );
}
