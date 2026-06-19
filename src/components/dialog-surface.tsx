import { useEffect, useRef, type ReactNode } from "react";

type DialogSurfaceProps = {
  open?: boolean;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  overlayClassName?: string;
  panelClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  children: ReactNode;
};

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DialogSurface({
  open = true,
  onClose,
  closeOnBackdrop = true,
  overlayClassName = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm",
  panelClassName = "relative",
  ariaLabel,
  ariaLabelledBy,
  children,
}: DialogSurfaceProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const focusable = panel?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    (focusable?.[0] ?? panel)?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!panelRef.current) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }

      if (event.key !== "Tab") return;

      const nodes = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (node) => !node.hasAttribute("disabled") && node.offsetParent !== null,
      );
      if (nodes.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      lastFocusedRef.current?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className={overlayClassName}
      onClick={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        tabIndex={-1}
        className={panelClassName}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
