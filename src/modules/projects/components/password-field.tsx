import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const fieldClass = "w-full rounded-lg border border-[var(--color-border)] bg-white/[0.03] px-3 py-2 pr-10 text-[13px] text-white outline-none placeholder:text-[var(--color-text-dim)] focus:border-[var(--color-accent)] disabled:opacity-50";

/**
 * Password input with an explicit reveal toggle.
 *
 * Paste is left enabled on purpose: a password manager's long random value is
 * much stronger than anything typed by hand, and blocking paste here would push
 * users toward something guessable.
 */
export function PasswordField({
  value,
  onChange,
  label,
  autoComplete = "current-password",
  disabled,
  autoFocus,
  onEnter,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  autoComplete?: "current-password" | "new-password";
  disabled?: boolean;
  autoFocus?: boolean;
  onEnter?: () => void;
  placeholder?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-[var(--color-text-dim)]">{label}</label>
      <div className="relative mt-1.5">
        <input
          id={id}
          type={revealed ? "text" : "password"}
          value={value}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          spellCheck={false}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && onEnter) {
              event.preventDefault();
              onEnter();
            }
          }}
          className={fieldClass}
        />
        <button
          type="button"
          onClick={() => setRevealed((current) => !current)}
          aria-label={revealed ? "Hide password" : "Show password"}
          aria-pressed={revealed}
          disabled={disabled}
          className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-50"
        >
          {revealed ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}
