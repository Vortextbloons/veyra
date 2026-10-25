import type { ReactNode } from "react";
import { ChevronRight, Loader2, X } from "lucide-react";
import { TOOL_CALL_ACCENT_STYLES, type ToolCallAccent } from "@/lib/tool-call-ui";

type ToolCallShellProps = {
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
  const styles = TOOL_CALL_ACCENT_STYLES[accent];
  const phaseTone = isError
    ? "text-red-300"
    : isActive
      ? styles.text
      : isDone
        ? "text-[var(--color-success)]"
        : "text-[var(--color-text-dim)]";

  const Wrapper = expandable ? "button" : "div";

  return (
    <div className="mb-1">
      <Wrapper
        {...(expandable
          ? {
              type: "button" as const,
              onClick: onToggle,
              "aria-expanded": expanded,
            }
          : {})}
        title={inputPreview?.slice(0, 180)}
        className={`group flex w-full items-center gap-3 rounded-md px-1 py-1 text-left transition-colors hover:bg-white/[0.035] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${expandable ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className={`flex size-4 shrink-0 items-center justify-center opacity-80 ${isError ? "text-red-300" : styles.text}`} aria-hidden="true">
          {isActive ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isError ? (
            <X className="size-4" />
          ) : (
            icon
          )}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] leading-5 text-white/65">
          <span className={isError ? "text-red-300/90" : ""}>
            {label}
          </span>
          <span className={`ml-2 text-[12px] ${phaseTone}`}>
            {phaseLabel}
          </span>
        </span>
        {expandable && (
          <ChevronRight
            className={`size-4 shrink-0 text-[var(--color-text-dim)]/50 transition-[color,transform] group-hover:text-[var(--color-accent)] ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </Wrapper>
      {children && <div className="ml-7">{children}</div>}
    </div>
  );
}
