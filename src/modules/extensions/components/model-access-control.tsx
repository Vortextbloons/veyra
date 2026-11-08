import { Sparkles, User } from "lucide-react";
import { modelAccessOf, type ModelAccess } from "@/modules/extensions/components/model-access";

/**
 * Per-Skill control for whether the model may load a Skill on its own.
 *
 * The inherited choice from the library default is highlighted, and choosing the
 * other option records an explicit override. Reset returns the Skill to the
 * default so it follows later changes without being edited again.
 */
export function ModelAccessControl({
  skill,
  defaultAllow,
  disabled = false,
  onChange,
}: {
  skill: { name: string; modelInvocable?: boolean };
  defaultAllow: boolean;
  disabled?: boolean;
  onChange: (access: ModelAccess) => void;
}) {
  const access = modelAccessOf(skill);
  const options: { id: ModelAccess; label: string; title: string; icon: typeof Sparkles }[] = [
    {
      id: "auto",
      label: "Model may use",
      title: `The model can load “${skill.name}” on its own when the task matches. You can still apply it yourself.`,
      icon: Sparkles,
    },
    {
      id: "manual",
      label: "Manual only",
      title: `Only you can apply “${skill.name}”. The model never loads it on its own.`,
      icon: User,
    },
  ];
  return (
    <div className="inline-flex items-center gap-1">
      <div
        role="radiogroup"
        aria-label={`Who can use ${skill.name}`}
        className="inline-flex rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-0.5"
      >
        {options.map((option) => {
          const explicit = access === option.id;
          const inherited = access === "default" && (defaultAllow ? option.id === "auto" : option.id === "manual");
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={explicit}
              disabled={disabled}
              title={inherited ? `${option.title} (following the library default)` : option.title}
              onClick={() => onChange(option.id)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors disabled:opacity-50 ${
                explicit
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : inherited
                    ? "text-white/70"
                    : "text-[var(--color-text-dim)] hover:text-white"
              }`}
            >
              <option.icon className="size-3" aria-hidden />
              {option.label}
            </button>
          );
        })}
      </div>
      {access !== "default" && !disabled && (
        <button
          type="button"
          onClick={() => onChange("default")}
          title={`Follow the library default (${defaultAllow ? "model may use" : "manual only"})`}
          className="rounded-md px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-dim)] transition-colors hover:text-white"
        >
          Reset
        </button>
      )}
    </div>
  );
}
