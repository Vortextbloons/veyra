import React from "react";
import { Bot, Tag, Shield, AlertTriangle, Sparkles } from "lucide-react";
import type { EmailAiOutput } from "../email-types";

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function renderClassificationDetails(output: EmailAiOutput): React.ReactNode {
  try {
    const parsed = JSON.parse(output.resultJson) as Record<string, unknown>;
    const needsReply = parsed.needsReply as boolean | undefined;
    const confidence = parsed.confidence as number | undefined;
    const reason = parsed.reason as string | undefined;
    return (
      <div className="mt-1 space-y-0.5 text-[10px] text-[var(--color-text-dim)]/70">
        {needsReply !== undefined && (
          <div>Needs reply: {needsReply ? "Yes" : "No"}</div>
        )}
        {confidence !== undefined && (
          <div>Confidence: {Math.round(confidence * 100)}%</div>
        )}
        {reason && <div>Reason: {reason}</div>}
      </div>
    );
  } catch {
    return null;
  }
}

export function renderUrgencyDetails(output: EmailAiOutput): React.ReactNode {
  try {
    const parsed = JSON.parse(output.resultJson) as Record<string, unknown>;
    const deadline = parsed.deadline as string | undefined;
    const reason = parsed.reason as string | undefined;
    return (
      <div className="mt-1 space-y-0.5 text-[10px] text-[var(--color-text-dim)]/70">
        {deadline && <div>Deadline: {deadline}</div>}
        {reason && <div>Reason: {reason}</div>}
      </div>
    );
  } catch {
    return null;
  }
}

export function renderSpamDetails(output: EmailAiOutput): React.ReactNode {
  try {
    const parsed = JSON.parse(output.resultJson) as Record<string, unknown>;
    const spamScore = parsed.spamScore as number | undefined;
    const marketingScore = parsed.marketingScore as number | undefined;
    const newsletter = parsed.newsletter as boolean | undefined;
    const reason = parsed.reason as string | undefined;
    return (
      <div className="mt-1 space-y-0.5 text-[10px] text-[var(--color-text-dim)]/70">
        {spamScore !== undefined && (
          <div>Spam: {Math.round(spamScore * 100)}%</div>
        )}
        {marketingScore !== undefined && (
          <div>Marketing: {Math.round(marketingScore * 100)}%</div>
        )}
        {newsletter !== undefined && (
          <div>Newsletter: {newsletter ? "Yes" : "No"}</div>
        )}
        {reason && <div>Reason: {reason}</div>}
      </div>
    );
  } catch {
    return null;
  }
}

export function getTaskTypeIcon(taskType: string): React.ReactNode {
  switch (taskType) {
    case "thread_summary":
      return <Sparkles className="mt-0.5 size-3 shrink-0 text-[var(--color-accent)]" />;
    case "classification":
      return <Tag className="mt-0.5 size-3 shrink-0 text-emerald-400" />;
    case "spam_score":
      return <Shield className="mt-0.5 size-3 shrink-0 text-amber-400" />;
    case "urgency_score":
      return <AlertTriangle className="mt-0.5 size-3 shrink-0 text-red-400" />;
    default:
      return <Bot className="mt-0.5 size-3 shrink-0 text-[var(--color-text-dim)]" />;
  }
}

export function getTaskTypeLabel(taskType: string): string {
  switch (taskType) {
    case "thread_summary":
      return "Summary";
    case "classification":
      return "Classification";
    case "spam_score":
      return "Spam / Marketing";
    case "urgency_score":
      return "Urgency";
    default:
      return taskType;
  }
}
