import { useState } from "react";
import type { ToolCallState } from "@/modules/chat/chat-types";
import {
  getToolCallUi,
  isToolCallActive,
  TOOL_CALL_ACCENT_STYLES,
  toolCallPhaseLabel,
} from "@/lib/tool-call-ui";
import { ToolCallShell } from "@/modules/chat/components/tool-call-shell";
import { mcpCapabilityId } from "@/modules/extensions/mcp-tool-adapter";
import { findCapabilityGrant, useExtensionsStore } from "@/modules/extensions/extensions-store";
import { useChatStore } from "@/stores/chat-store";

export type ToolCallIndicatorProps = {
  state: ToolCallState;
};

export function ToolCallIndicator({ state }: ToolCallIndicatorProps) {
  const [expanded, setExpanded] = useState(false);
  const addGrant = useExtensionsStore((store) => store.addGrant);
  const grants = useExtensionsStore((store) => store.grants);
  const updateToolCallState = useChatStore((store) => store.updateToolCallState);
  const meta = getToolCallUi(state.name, state.label);
  const Icon = meta.icon;
  const isActive = isToolCallActive(state.phase);
  const isError = state.phase === "error";
  const isDone = state.phase === "done";
  const hasDetails = Boolean(state.detail || state.error);
  const approval = state.mcpApproval;
  const isApproved = Boolean(approval && findCapabilityGrant(grants, {
    serverId: approval.serverId,
    capabilityId: mcpCapabilityId(approval.serverId, approval.toolName),
    projectId: approval.projectId,
    chatId: approval.chatId,
    capabilityFingerprint: approval.capabilityFingerprint,
  }));
  const displayError = isError && !isApproved;
  const displayDone = isDone || isApproved;

  const approveForChat = () => {
    if (!approval) return;
    addGrant({
      serverId: approval.serverId,
      capabilityId: mcpCapabilityId(approval.serverId, approval.toolName),
      category: "external_mutation",
      decision: "allow",
      chatId: approval.chatId,
      projectId: approval.projectId,
      capabilityFingerprint: approval.capabilityFingerprint,
    });
    updateToolCallState(state.id, {
      phase: "done",
      detail: `Approved for this chat. Send the request again to call ${approval.toolName}.`,
      error: undefined,
      mcpApproval: undefined,
    });
  };

  return (
    <ToolCallShell
      icon={<Icon className={`size-3 ${TOOL_CALL_ACCENT_STYLES[meta.accent].text}`} />}
      label={state.label || meta.label}
      phaseLabel={toolCallPhaseLabel(state.phase, state.attempts)}
      accent={meta.accent}
      isActive={isActive}
      isError={displayError}
      isDone={displayDone}
      inputPreview={state.input || (displayDone ? state.detail : undefined)}
      expandable={hasDetails || Boolean(approval)}
      expanded={expanded}
      onToggle={() => setExpanded((value) => !value)}
    >
      {expanded && (hasDetails || approval) && (
        <div
          className={`mt-1 rounded-lg border px-3 py-2 text-[11.5px] ${
            displayError
              ? "border-red-500/20 bg-red-500/[0.06] text-red-300"
              : "border-[var(--color-border)] bg-[var(--color-panel)]/50 text-[var(--color-text-dim)]"
          }`}
        >
          <p>{isApproved ? `Approved for this chat. Send the request again to call ${approval?.toolName}.` : state.error || state.detail}</p>
          {approval && !isApproved && (
            <button
              type="button"
              onClick={approveForChat}
              className="mt-2 rounded-md border border-amber-300/25 bg-amber-300/10 px-2.5 py-1.5 text-[10.5px] font-medium text-amber-100 transition-colors hover:bg-amber-300/20"
            >
              Approve for this chat
            </button>
          )}
        </div>
      )}
    </ToolCallShell>
  );
}
