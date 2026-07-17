import { useSyncExternalStore } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import {
  getConversationStorageIssue,
  subscribeConversationStorageIssue,
} from "@/lib/conversation-storage";

export function ConversationStorageBanner() {
  const issue = useSyncExternalStore(
    subscribeConversationStorageIssue,
    getConversationStorageIssue,
    getConversationStorageIssue,
  );

  if (!issue) return null;
  const isError = issue.severity === "error";
  const Icon = isError ? ShieldAlert : AlertTriangle;

  return (
    <div
      role={isError ? "alert" : "status"}
      className={`flex shrink-0 items-center gap-3 border-b px-4 py-2.5 ${
        isError
          ? "border-red-500/25 bg-red-500/[0.1]"
          : "border-amber-500/25 bg-amber-500/[0.08]"
      }`}
    >
      <Icon
        className={`size-4 shrink-0 ${
          isError ? "text-red-300" : "text-amber-300"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-white">
          {isError ? "Conversation storage needs attention" : "Conversation recovery active"}
        </p>
        <p className="text-[11px] leading-5 text-[var(--color-text-dim)]">
          {issue.message}
        </p>
      </div>
    </div>
  );
}
