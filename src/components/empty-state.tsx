import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  iconClassName?: string;
  titleClassName?: string;
  descriptionClassName?: string;
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "flex flex-col items-center justify-center gap-2.5 py-8 text-center text-[14px] text-[var(--color-text-dim)]",
  iconClassName = "size-7 text-[var(--color-text-dim)]/55",
  titleClassName = "px-1 text-[15px] font-semibold text-[var(--color-text)]",
  descriptionClassName = "max-w-sm text-[13px] leading-relaxed text-[var(--color-text-dim)]",
}: EmptyStateProps) {
  return (
    <div className={className}>
      <div className={iconClassName}>{icon}</div>
      <div className={titleClassName}>{title}</div>
      {description && <div className={descriptionClassName}>{description}</div>}
      {action}
    </div>
  );
}
