import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";

/**
 * Shared shell for the compact listbox triggers in the composer.
 * `ModelSelector` and `ProviderSelector` both render this exact markup.
 */
export function SelectorTrigger({
  label,
  title,
  open,
  onClick,
  labelMaxWidth = "max-w-[160px]",
  badge,
}: {
  label: string;
  title?: string;
  open: boolean;
  onClick: () => void;
  labelMaxWidth?: string;
  badge?: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-haspopup="listbox"
      aria-expanded={open}
      onClick={onClick}
      className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px] transition-colors ${
        open
          ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
          : "border-[var(--color-border)] bg-[var(--color-panel)] text-white hover:border-[var(--color-border-strong)]"
      }`}
    >
      <span className={`${labelMaxWidth} truncate font-medium`}>{label}</span>
      {badge}
      <ChevronDown
        className={`size-3 text-[var(--color-text-dim)] transition-transform ${
          open ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

export function SelectorMenu({
  children,
  widthClassName = "w-64",
}: {
  children: ReactNode;
  widthClassName?: string;
}) {
  return (
    <div
      role="listbox"
      className={`absolute bottom-full left-0 z-50 mb-1.5 ${widthClassName} overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl shadow-black/40`}
    >
      {children}
    </div>
  );
}

export function SelectorOption({
  active,
  onSelect,
  primary,
  meta,
  trailing,
  title,
}: {
  active: boolean;
  onSelect: () => void;
  primary: string;
  meta: ReactNode;
  trailing?: ReactNode;
  title?: string;
}) {
  return (
    <div
      title={title}
      role="option"
      tabIndex={0}
      aria-selected={active}
      className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
        active ? "bg-[var(--color-accent-soft)]" : "hover:bg-white/[0.04]"
      }`}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="min-w-0 flex-1">
        <div
          className={`truncate text-[12.5px] font-medium ${
            active ? "text-white" : "text-[var(--color-text)]"
          }`}
        >
          {primary}
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
          {meta}
        </div>
      </div>
      {trailing}
      {active && <Check className="size-3.5 shrink-0 text-[var(--color-accent)]" />}
    </div>
  );
}

/** Dimmed "·" separator used between optional metadata chips. */
export function SelectorMetaSeparator() {
  return <span className="opacity-50">·</span>;
}
