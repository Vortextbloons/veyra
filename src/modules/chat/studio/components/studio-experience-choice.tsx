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
    title: "Studio Chat",
    description: "Wide visual responses generated with HTML and CSS.",
  },
];

type StudioExperienceChoiceProps = {
  value: ConversationExperience;
  onChange: (experience: ConversationExperience) => void;
  disabled?: boolean;
  studioAvailable?: boolean;
};

export function StudioExperienceChoice({
  value,
  onChange,
  disabled = false,
  studioAvailable = true,
}: StudioExperienceChoiceProps) {
  if (!studioAvailable) return null;

  return (
    <div
      role="radiogroup"
      aria-label="Conversation experience"
      className="grid grid-cols-2 gap-2"
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
            className={`rounded-lg border px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]/50 disabled:cursor-not-allowed disabled:opacity-45 ${
              selected
                ? "border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] bg-[var(--color-panel)] hover:border-[var(--color-border-strong)]"
            }`}
          >
            <span className="block text-[12.5px] font-medium text-white">{choice.title}</span>
            <span className="mt-1 block text-[11px] leading-relaxed text-[var(--color-text-dim)]">
              {choice.description}
            </span>
          </button>
        );
      })}
    </div>
  );
}
