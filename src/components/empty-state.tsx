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
  className = "flex flex-col items-center justify-center gap-2 py-6 text-center text-[12px] text-[var(--color-text-dim)]",
  iconClassName = "size-7 text-[var(--color-text-dim)]/40",
  titleClassName = "px-1",
  descriptionClassName = "max-w-xs text-[var(--color-text-dim)]",
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
