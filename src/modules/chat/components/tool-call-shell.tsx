import type { ReactNode } from "react";
import { ChevronRight, Loader2, X } from "lucide-react";
import { type ToolCallAccent } from "@/lib/tool-call-ui";

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
  icon: _icon,
  label,
  phaseLabel,
  accent: _accent,
  isActive,
  isError,
  isDone: _isDone,
  inputPreview,
  expandable = false,
  expanded = false,
  onToggle,
  children,
}: ToolCallShellProps) {
  const phaseTone = isError ? "text-red-300" : "text-[var(--color-text-dim)]";

  const Wrapper = expandable ? "button" : "div";

  return (
    <div className="my-1">
      <Wrapper
        {...(expandable
          ? {
              type: "button" as const,
              onClick: onToggle,
              "aria-expanded": expanded,
            }
          : {})}
        title={inputPreview?.slice(0, 180)}
        className={`group flex max-w-full items-center gap-2 rounded-md py-1.5 text-left transition-colors hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 ${expandable ? "cursor-pointer" : "cursor-default"}`}
      >
        {isActive && <Loader2 aria-hidden="true" className="size-3 shrink-0 animate-spin motion-reduce:animate-none" />}
        {isError && <X aria-hidden="true" className="size-3 shrink-0 text-red-300" />}
        <span className="min-w-0 truncate text-[12px] leading-5 text-[var(--color-text-dim)]">
          <span className={isError ? "text-red-300/90" : ""}>
            {label}
          </span>
          <span className={`ml-2 text-[12px] ${phaseTone}`}>
            {phaseLabel}
          </span>
        </span>
        {inputPreview && (
          <span className="min-w-0 truncate text-[12px] text-[var(--color-text-dim)]/60 sm:block">{inputPreview}</span>
        )}
        {expandable && (
          <ChevronRight
            className={`size-3 shrink-0 text-[var(--color-text-dim)]/50 transition-[color,transform] group-hover:text-[var(--color-text)] ${expanded ? "rotate-90" : ""}`}
          />
        )}
      </Wrapper>
      {expanded && children && <div className="mb-3 ml-1 border-l border-[var(--color-border)] py-1 pl-4">{children}</div>}
    </div>
  );
}
