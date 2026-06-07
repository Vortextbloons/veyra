import type { LucideIcon } from "lucide-react";
import { FileText, Search, Wrench } from "lucide-react";
import type { ToolCallPhase } from "@/lib/chat-types";
import {
  DOC_CREATE_TOOL_NAME,
  DOC_UPDATE_TOOL_NAME,
  WEB_SEARCH_TOOL_NAME,
} from "@/lib/tool-registry";

export type ToolCallAccent = "cyan" | "emerald" | "violet" | "amber";

export type ToolCallUiMeta = {
  label: string;
  icon: LucideIcon;
  accent: ToolCallAccent;
};

export const TOOL_CALL_UI: Record<string, ToolCallUiMeta> = {
  [WEB_SEARCH_TOOL_NAME]: {
    label: "Web Search",
    icon: Search,
    accent: "cyan",
  },
  [DOC_CREATE_TOOL_NAME]: {
    label: "Create Document",
    icon: FileText,
    accent: "emerald",
  },
  [DOC_UPDATE_TOOL_NAME]: {
    label: "Update Document",
    icon: FileText,
    accent: "emerald",
  },
};

export function getToolCallUi(name: string, fallbackLabel?: string): ToolCallUiMeta {
  return (
    TOOL_CALL_UI[name] ?? {
      label: fallbackLabel ?? name.replace(/_/g, " "),
      icon: Wrench,
      accent: "violet",
    }
  );
}

export type ToolCallAccentStyles = {
  border: string;
  bg: string;
  hover: string;
  text: string;
  iconBg: string;
  badge: string;
};

export const TOOL_CALL_ACCENT_STYLES: Record<ToolCallAccent, ToolCallAccentStyles> = {
  cyan: {
    border: "border-cyan-500/20",
    bg: "bg-cyan-500/[0.06]",
    hover: "hover:border-cyan-500/30 hover:bg-cyan-500/[0.09]",
    text: "text-cyan-300",
    iconBg: "bg-cyan-500/20",
    badge: "bg-cyan-400/10 text-cyan-300 ring-cyan-500/20",
  },
  emerald: {
    border: "border-emerald-500/20",
    bg: "bg-emerald-500/[0.06]",
    hover: "hover:border-emerald-500/30 hover:bg-emerald-500/[0.09]",
    text: "text-emerald-300",
    iconBg: "bg-emerald-500/20",
    badge: "bg-emerald-400/10 text-emerald-300 ring-emerald-500/20",
  },
  violet: {
    border: "border-violet-500/20",
    bg: "bg-violet-500/[0.06]",
    hover: "hover:border-violet-500/30 hover:bg-violet-500/[0.09]",
    text: "text-violet-300",
    iconBg: "bg-violet-500/20",
    badge: "bg-violet-400/10 text-violet-300 ring-violet-500/20",
  },
  amber: {
    border: "border-amber-500/20",
    bg: "bg-amber-500/[0.06]",
    hover: "hover:border-amber-500/30 hover:bg-amber-500/[0.09]",
    text: "text-amber-300",
    iconBg: "bg-amber-500/20",
    badge: "bg-amber-400/10 text-amber-300 ring-amber-500/20",
  },
};

export function toolCallPhaseLabel(phase: ToolCallPhase, attempts?: number): string {
  switch (phase) {
    case "pending":
      return "Preparing…";
    case "running":
      return "Running…";
    case "retrying":
      return attempts ? `Retrying (${attempts}/2)…` : "Retrying…";
    case "error":
      return "Failed";
    case "done":
      return "Completed";
    default:
      return phase;
  }
}

export function isToolCallActive(phase: ToolCallPhase): boolean {
  return phase === "pending" || phase === "running" || phase === "retrying";
}
