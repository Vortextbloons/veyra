import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ShieldAlert, ShieldCheck, ShieldHalf } from "lucide-react";
import { useSettingsStore } from "@/stores/settings-store";
import { PERMISSION_MODES, type PermissionMode } from "@/stores/slices/permissions-slice";
import { usePermissionStore } from "@/modules/permissions/permission-store";
import { permissionModeDescription, permissionModeLabel } from "@/modules/permissions/permission-policy";
import { placePopoverAbove, POPOVER_GAP } from "./popover-placement";

const MODE_ICON = {
  ask: ShieldAlert,
  auto: ShieldHalf,
  full: ShieldCheck,
} as const;

const MODE_ACCENT: Record<PermissionMode, string> = {
  ask: "text-amber-300",
  auto: "text-sky-300",
  full: "text-emerald-300",
};

const POPOVER_WIDTH = 300;

/**
 * The per-chat permission mode control.
 *
 * Sits next to the composer so the mode in force is visible while typing. The
 * choice is stored per chat; the Settings page owns the default for new chats.
 *
 * Tool on/off switches live in Chat settings and Settings → Permissions, not
 * here: this popover stays a single decision about how protected calls are
 * cleared.
 */
export function PermissionModeControl({ sessionId, disabled = false }: { sessionId: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  // Positioned from measured coordinates in a portal instead of being
  // absolutely positioned inside the composer, so the popover cannot be clipped
  // by a narrow panel or overflow the window edge.
  const [position, setPosition] = useState({ left: 0, bottom: 0, width: POPOVER_WIDTH, maxHeight: 0, ready: false });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const defaultMode = useSettingsStore((state) => state.permissionMode);
  const chatModes = usePermissionStore((state) => state.chatPermissionModes);
  const setChatPermissionMode = usePermissionStore((state) => state.setChatPermissionMode);

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const placement = placePopoverAbove(
      { right: rect.right, top: rect.top },
      { width: window.innerWidth, height: window.innerHeight },
      POPOVER_WIDTH,
      POPOVER_GAP,
    );
    setPosition({ ...placement, ready: true });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Before a chat exists there is nothing to override, so show the default.
  const mode: PermissionMode = sessionId ? chatModes[sessionId] ?? defaultMode : defaultMode;
  const overridden = Boolean(sessionId && chatModes[sessionId]);
  const Icon = MODE_ICON[mode];

  const choose = (next: PermissionMode) => {
    if (sessionId) setChatPermissionMode(sessionId, next);
    setOpen(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Tool permission mode: ${permissionModeLabel(mode)}`}
        title={`Tool permissions: ${permissionModeLabel(mode)}`}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        className={`flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          open
            ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
            : "border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:text-white"
        }`}
      >
        <Icon aria-hidden className={`size-3.5 ${MODE_ACCENT[mode]}`} />
        <span className="font-medium text-white">{permissionModeLabel(mode)}</span>
        {overridden && <span aria-hidden className="size-1 rounded-full bg-[var(--color-accent)]" />}
        <ChevronDown
          aria-hidden
          className={`size-3 text-[var(--color-text-dim)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label="Tool permission mode"
            style={{
              position: "fixed",
              left: position.left,
              bottom: position.bottom,
              width: position.width,
              maxHeight: position.maxHeight,
            }}
            className={`z-50 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl shadow-black/40 scrollbar-thin transition-opacity duration-150 ${
              position.ready ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            <div className="px-2.5 py-2 text-[10.5px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
              Tool permissions
            </div>
            <div className="space-y-0.5 p-1">
              {PERMISSION_MODES.map((option) => {
                const OptionIcon = MODE_ICON[option];
                const selected = option === mode;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={!sessionId}
                    onClick={() => choose(option)}
                    className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                      selected ? "bg-[var(--color-accent-soft)]" : "hover:bg-white/[0.04]"
                    }`}
                  >
                    <OptionIcon aria-hidden className={`mt-0.5 size-3.5 shrink-0 ${MODE_ACCENT[option]}`} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[12px] font-medium ${selected ? "text-white" : "text-[var(--color-text)]"}`}>
                        {permissionModeLabel(option)}
                      </span>
                      <span className="mt-0.5 block text-[10.5px] leading-snug text-[var(--color-text-dim)]">
                        {permissionModeDescription(option)}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="border-t border-[var(--color-border)] px-2.5 py-2 text-[10.5px] leading-snug text-[var(--color-text-dim)]">
              {sessionId
                ? `Applies to this chat. ${
                    overridden
                      ? `Default for new chats is ${permissionModeLabel(defaultMode)}.`
                      : "This chat follows the default."
                  }`
                : `Send a message to start a chat, then change its mode. Default is ${permissionModeLabel(defaultMode)}.`}
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
