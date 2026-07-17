import { useState } from "react";

type ToggleProps = {
  on: boolean;
  onChange: (on: boolean) => void;
  label?: string;
  ariaLabel?: string;
  disabled?: boolean;
};

export function Toggle({ on, onChange, label, ariaLabel, disabled }: ToggleProps) {
  const [pressed, setPressed] = useState(false);

  const track = on ? "bg-emerald-500" : "bg-zinc-700";
  const knobPos = on ? "translate-x-[18px]" : "translate-x-0.5";
  const scale = pressed && !disabled ? "scale-[0.97]" : "scale-100";

  const knob = (
    <span
      aria-hidden
      className={`pointer-events-none absolute top-0.5 inline-block size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.4),0_0_0_1px_rgba(0,0,0,0.05)] transition-transform duration-200 ease-out ${knobPos} ${scale}`}
    />
  );

  if (!label) {
    return (
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={ariaLabel ?? label ?? "Toggle setting"}
        disabled={disabled}
        onClick={() => !disabled && onChange(!on)}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ${track} ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40`}
      >
        {knob}
      </button>
    );
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => !disabled && onChange(!on)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      className={`group flex min-h-8 items-center gap-2 rounded-md px-2 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus)] ${
        on
          ? "text-white"
          : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span className="font-medium">{label}</span>
      <span
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ${track}`}
      >
        {knob}
      </span>
    </button>
  );
}
