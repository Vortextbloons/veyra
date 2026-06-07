import type { ReactNode } from "react";
import { CheckCircle2, ChevronDown, Loader2, X } from "lucide-react";
import { TOOL_CALL_ACCENT_STYLES, type ToolCallAccent } from "@/lib/tool-call-ui";

export type ToolCallShellProps = {
  icon: ReactNode;
  label: string;
  phaseLabel: string;
  accent: ToolCallAccent;
  isActive: boolean;
  isError: boolean;
  isDone: boolean;
  inputPreview?: string;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
};

export function ToolCallShell({
  icon,
  label,
  phaseLabel,
  accent,
  isActive,
  isError,
  isDone,
  inputPreview,
  expandable = false,
  expanded = false,
  onToggle,
  children,
}: ToolCallShellProps) {
  const styles = isError
    ? {
        border: "border-red-500/20",
        bg: "bg-red-500/[0.06]",
        hover: "hover:border-red-500/30 hover:bg-red-500/[0.09]",
        text: "text-red-300",
        iconBg: "bg-red-500/20",
      }
    : TOOL_CALL_ACCENT_STYLES[accent];

  const Wrapper = expandable ? "button" : "div";

  return (
    <div className="mb-2">
      <Wrapper
        {...(expandable
          ? {
              type: "button" as const,
              onClick: onToggle,
            }
          : {})}
        className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${styles.border} ${styles.bg} ${expandable ? styles.hover : ""}`}
      >
        <div className={`flex size-5 shrink-0 items-center justify-center rounded ${styles.iconBg}`}>
          {isActive ? (
            <Loader2 className={`size-3 animate-spin ${styles.text}`} />
          ) : isError ? (
            <X className="size-3 text-red-400" />
          ) : isDone ? (
            <CheckCircle2 className={`size-3 ${styles.text}`} />
          ) : (
            icon
          )}
        </div>
        <div className="min-w-0 flex-1">
          <span className={`text-[11.5px] font-medium ${isError ? "text-red-300" : styles.text}`}>
            {label}
          </span>
          <span className="mx-1.5 text-[10px] text-[var(--color-text-dim)]/40">·</span>
          <span className="text-[11.5px] text-[var(--color-text-dim)]">{phaseLabel}</span>
        </div>
        {inputPreview && (
          <span className="max-w-[240px] shrink-0 truncate font-mono text-[10.5px] text-[var(--color-text-dim)]/60">
            {inputPreview}
          </span>
        )}
        {expandable && (
          <ChevronDown
            className={`size-3 shrink-0 text-[var(--color-text-dim)]/50 transition-transform ${expanded ? "rotate-180" : ""}`}
          />
        )}
      </Wrapper>
      {children}
    </div>
  );
}
