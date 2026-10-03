import type { ConversationExperience } from "@/modules/chat/studio/studio-types";

const CHOICES: Array<{
  value: ConversationExperience;
  title: string;
  description: string;
}> = [
  {
    value: "standard",
    title: "Standard Chat",
    description: "Conversational responses using Markdown.",
  },
  {
    value: "studio",
    title: "Studio",
    description: "A living environment for visual explanations, interactions, and creative experiences.",
  },
];

type StudioExperienceChoiceProps = {
  value: ConversationExperience;
  onChange: (experience: ConversationExperience) => void;
  disabled?: boolean;
  studioAvailable?: boolean;
  compact?: boolean;
};

export function StudioExperienceChoice({
  value,
  onChange,
  disabled = false,
  studioAvailable = true,
  compact = false,
}: StudioExperienceChoiceProps) {
  if (!studioAvailable) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Conversation experience"
      className={compact ? "inline-flex rounded-full bg-white/[0.05] p-1" : "grid grid-cols-2 gap-2"}
    >
      {CHOICES.map((choice) => {
        const selected = value === choice.value;
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(choice.value)}
            title={choice.description}
            className={compact ? `min-w-24 rounded-full px-5 py-2 text-[13px] transition-colors disabled:opacity-45 ${selected ? "bg-white/[0.08] font-medium text-white" : "text-[var(--color-text-dim)] hover:text-white"}` : `rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50 disabled:cursor-not-allowed disabled:opacity-45 ${
              selected
                ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            <span className={compact ? "" : "block text-[12.5px] font-medium text-white"}>{compact ? choice.value === "standard" ? "Chat" : "Studio" : choice.title}</span>
            {!compact && <span className="mt-1 block text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              {choice.description}
            </span>}
          </button>
        );
      })}
    </div>
  );
}
