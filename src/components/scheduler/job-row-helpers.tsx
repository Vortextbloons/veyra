import type { ReactNode } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  MessageSquare,
  Wrench,
  Brain,
  FileText,
  Zap,
  Bot,
  Mail,
  Tag,
  Shield,
  AlertTriangle,
  Sparkles,
} from "lucide-react";
import type { AiJobStatus, AiJobType } from "@/lib/ai-scheduler";

export function formatElapsed(startedAt: number): string {
  const seconds = Math.floor((Date.now() - startedAt) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

export function formatDurationMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

export function statusIcon(status: AiJobStatus): ReactNode {
  switch (status) {
    case "running":
      return <Loader2 className="size-3 animate-spin text-indigo-400" />;
    case "completed":
      return <CheckCircle2 className="size-3 text-emerald-400" />;
    case "failed":
      return <XCircle className="size-3 text-red-400" />;
    case "cancelled":
    case "aborted":
      return <AlertCircle className="size-3 text-amber-400" />;
    case "queued":
      return <Clock className="size-3 text-[var(--color-text-dim)]" />;
  }
}

export function statusColor(status: AiJobStatus): string {
  switch (status) {
    case "running":
      return "text-indigo-400 bg-indigo-500/15 ring-indigo-500/25";
    case "completed":
      return "text-emerald-400 bg-emerald-500/15 ring-emerald-500/25";
    case "failed":
      return "text-red-400 bg-red-500/15 ring-red-500/25";
    case "cancelled":
    case "aborted":
      return "text-amber-400 bg-amber-500/15 ring-amber-500/25";
    case "queued":
      return "text-[var(--color-text-dim)] bg-white/[0.04] ring-white/[0.06]";
  }
}

export function statusBorderColor(status: AiJobStatus): string {
  switch (status) {
    case "running":
      return "border-indigo-500/30";
    case "completed":
      return "border-emerald-500/30";
    case "failed":
      return "border-red-500/30";
    case "cancelled":
    case "aborted":
      return "border-amber-500/30";
    case "queued":
      return "border-[var(--color-border)]";
  }
}

export function jobTypeIcon(type: AiJobType): ReactNode {
  switch (type) {
    case "user_chat":
      return <MessageSquare className="size-3.5" />;
    case "agent_pi":
      return <Bot className="size-3.5" />;
    case "auto_name_chat":
    case "summarize_chat":
      return <FileText className="size-3.5" />;
    case "extract_memory":
      return <Brain className="size-3.5" />;
    case "compress_context":
      return <Zap className="size-3.5" />;
    case "maintenance":
      return <Wrench className="size-3.5" />;
    case "email_thread_summary":
      return <Sparkles className="size-3.5" />;
    case "email_classification":
      return <Tag className="size-3.5" />;
    case "email_spam_score":
      return <Shield className="size-3.5" />;
    case "email_urgency_score":
      return <AlertTriangle className="size-3.5" />;
    case "email_reply_draft":
      return <Mail className="size-3.5" />;
    default:
      return <Bot className="size-3.5" />;
  }
}
