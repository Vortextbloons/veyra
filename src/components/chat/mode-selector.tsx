import { useRef, useState, type ReactNode } from "react";
import { Bot, Check, ChevronDown, Drama, MessageSquare, Telescope } from "lucide-react";
import type { ChatMode } from "@/lib/chat-types";
import { useClickOutside } from "@/hooks/use-click-outside";

const MODES: { id: ChatMode; label: string; description: string; icon: ReactNode }[] = [
  {
    id: "chat",
    label: "Chat",
    description: "Single back-and-forth conversation",
    icon: <MessageSquare className="size-3.5" />,
  },
  {
    id: "agents",
    label: "Agents",
    description: "Multi-step tasks with tools",
    icon: <Bot className="size-3.5" />,
  },
  {
    id: "characters",
    label: "Characters",
    description: "Roleplay with custom persona cards",
    icon: <Drama className="size-3.5" />,
  },
  {
    id: "research",
    label: "Deep Research",
    description: "In-depth research and analysis",
    icon: <Telescope className="size-3.5" />,
  },
];

export type ModeSelectorProps = {
  value: ChatMode;
  onChange?: (mode: ChatMode) => void;
  disabled?: boolean;
};

export function ModeSelector({ value, onChange, disabled = false }: ModeSelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = MODES.find((m) => m.id === value) ?? MODES[0];

  useClickOutside(ref, open, () => { if (!disabled) setOpen(false); });

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11.5px] font-medium transition-colors ${
          open
            ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
            : "border-[var(--color-border)] bg-[var(--color-bg)]/40 text-[var(--color-text-dim)] hover:border-[var(--color-border-strong)] hover:bg-white/[0.03] hover:text-white"
        } ${disabled ? "cursor-not-allowed opacity-50 hover:border-[var(--color-border)] hover:bg-[var(--color-bg)]/40 hover:text-[var(--color-text-dim)]" : ""}`}
      >
        {current.icon}
        <span>{current.label}</span>
        <ChevronDown
          className={`size-3 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && !disabled && (
        <div
          role="listbox"
          aria-label="Mode"
          className="absolute bottom-full left-0 z-50 mb-1.5 w-60 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-1 shadow-2xl shadow-black/50"
        >
          {MODES.map((m) => {
            const active = m.id === value;
            return (
              <button
                key={m.id}
                role="option"
                aria-selected={active}
                onClick={() => {
                  onChange?.(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors ${
                  active
                    ? "bg-[var(--color-accent-soft)]"
                    : "hover:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-md ${
                    active
                      ? "bg-[var(--color-accent)] text-white"
                      : "bg-white/[0.04] text-[var(--color-text-dim)]"
                  }`}
                >
                  {m.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div
                    className={`text-[12px] font-medium ${
                      active ? "text-white" : "text-[var(--color-text)]"
                    }`}
                  >
                    {m.label}
                  </div>
                  <div className="mt-0.5 text-[10.5px] leading-snug text-[var(--color-text-dim)]">
                    {m.description}
                  </div>
                </div>
                {active && (
                  <Check className="mt-1 size-3.5 shrink-0 text-[var(--color-accent)]" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
