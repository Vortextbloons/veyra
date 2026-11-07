import type { ReactNode } from "react";

/**
 * Shared settings layout primitives.
 *
 * The settings surface is wide: content fills the window instead of sitting in
 * a narrow column, and each group is a single bordered card with rows split on
 * hairlines. Rows keep the explanation next to the control it changes so no
 * value is ever described far from its switch.
 */

export function SettingsHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[21px] font-semibold tracking-tight text-white">{title}</h1>
        {description && (
          <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-[var(--color-text-dim)]">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function SettingsPanel({
  title,
  description,
  actions,
  children,
  className = "",
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[14.5px] font-semibold text-white">{title}</h2>}
            {description && (
              <p className="mt-0.5 max-w-[64ch] text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function SettingsCard({
  children,
  className = "",
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "ul";
}) {
  return (
    <As
      className={`overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] ${className}`}
    >
      {children}
    </As>
  );
}

/** Divider-separated rows inside a card. */
export function SettingsRows({ children }: { children: ReactNode }) {
  return <div className="divide-y divide-[var(--color-border)]">{children}</div>;
}

export function SettingRow({
  label,
  description,
  children,
  htmlFor,
  stack = false,
  className = "",
}: {
  label: string;
  description?: string;
  children: ReactNode;
  htmlFor?: string;
  /** Put the control under the text instead of beside it. */
  stack?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-4 px-5 py-4 ${
        stack ? "flex-col" : "flex-col sm:flex-row sm:items-center sm:justify-between"
      } ${className}`}
    >
      <div className="min-w-0 flex-1">
        <label
          htmlFor={htmlFor}
          className="block text-[13.5px] font-medium leading-snug text-white"
        >
          {label}
        </label>
        {description && (
          <p className="mt-1 max-w-[62ch] text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
            {description}
          </p>
        )}
      </div>
      <div className={`min-w-0 ${stack ? "" : "shrink-0"}`}>{children}</div>
    </div>
  );
}

export function SettingValue({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1 font-mono text-[11.5px] tabular-nums text-white">
      {children}
    </span>
  );
}

type CalloutTone = "info" | "warning" | "danger" | "success";

const CALLOUT_TONES: Record<CalloutTone, string> = {
  info: "border-[var(--color-border)] bg-white/[0.03] text-[var(--color-text-dim)]",
  warning: "border-amber-500/25 bg-amber-500/[0.08] text-amber-100",
  danger: "border-red-500/25 bg-red-500/[0.08] text-red-100",
  success: "border-emerald-500/25 bg-emerald-500/[0.08] text-emerald-100",
};

export function SettingsCallout({
  tone = "info",
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-4 py-3 text-[12.5px] leading-relaxed ${CALLOUT_TONES[tone]}`}>
      {title && <p className="mb-0.5 font-medium">{title}</p>}
      {children}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      {icon && <div className="text-[var(--color-text-dim)]">{icon}</div>}
      <p className="text-[13.5px] font-medium text-white">{title}</p>
      {description && (
        <p className="max-w-[46ch] text-[12.5px] leading-relaxed text-[var(--color-text-dim)]">
          {description}
        </p>
      )}
      {action}
    </div>
  );
}

export const settingsInputClass =
  "w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[13px] text-white outline-none transition-colors placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)]/60";

export const settingsTextareaClass =
  "w-full resize-y rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3.5 py-3 font-mono text-[12.5px] leading-relaxed text-white outline-none transition-colors placeholder:text-[var(--color-text-dim)]/50 focus:border-[var(--color-accent)]/60";

export const settingsButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] font-medium text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50";

export const settingsIconButtonClass =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-dim)] transition-colors hover:border-[var(--color-border-strong)] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const settingsPrimaryButtonClass =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50";
