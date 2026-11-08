import { Sparkles, X, Pin } from "lucide-react";
import type { SkillRecord } from "@/modules/extensions/extension-types";

/**
 * The visible reminder of which Skills a request will use.
 *
 * A one-request Skill is the soft case: it disappears when the message is sent.
 * A chat Skill is pinned, so it gets a distinct accent and an explicit "Pinned"
 * note. Neither can change the chat silently.
 */
export function SkillChip({
  name,
  description,
  persistent,
  onRemove,
  onPin,
  disabled = false,
}: {
  name: string;
  description?: string;
  persistent: boolean;
  onRemove?: () => void;
  /** Offered on a one-request Skill so making it persistent is a choice. */
  onPin?: () => void;
  disabled?: boolean;
}) {
  return (
    <span
      className={`group/skill inline-flex max-w-full items-center gap-1.5 rounded-lg border py-1 pl-2 pr-1 text-[11.5px] transition-colors ${
        persistent
          ? "border-violet-400/30 bg-violet-400/10 text-violet-100"
          : "border-white/12 bg-white/[0.05] text-white/85"
      }`}
      title={description || name}
    >
      {persistent ? <Pin className="size-3 shrink-0 text-violet-200" aria-hidden /> : <Sparkles className="size-3 shrink-0 opacity-70" aria-hidden />}
      <span className="min-w-0 truncate font-medium">{name}</span>
      <span className="shrink-0 text-[10px] text-[var(--color-text-dim)]">
        {persistent ? "Pinned" : "This message"}
      </span>
      {onPin && !disabled && (
        <button
          type="button"
          aria-label={`Use ${name} for this chat`}
          title="Use for this chat"
          onClick={onPin}
          className="grid size-4 shrink-0 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-white focus-visible:opacity-100 group-hover/skill:opacity-100"
        >
          <Pin className="size-3" />
        </button>
      )}
      {onRemove && !disabled && (
        <button
          type="button"
          aria-label={persistent ? `Stop using ${name} in this chat` : `Remove ${name} from this message`}
          title={persistent ? "Remove from this chat" : "Remove from this message"}
          onClick={onRemove}
          className="grid size-4 shrink-0 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:text-white"
        >
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

/** Chips for everything currently applied to the next request. */
export function SkillChipRow({
  chatSkills,
  pendingSkills,
  disabled = false,
  onRemoveChatSkill,
  onRemovePendingSkill,
  onPinPendingSkill,
}: {
  chatSkills: SkillRecord[];
  pendingSkills: SkillRecord[];
  disabled?: boolean;
  onRemoveChatSkill?: (skill: SkillRecord) => void;
  onRemovePendingSkill?: (skill: SkillRecord) => void;
  onPinPendingSkill?: (skill: SkillRecord) => void;
}) {
  if (chatSkills.length === 0 && pendingSkills.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-2 pb-1" aria-label="Skills for this request">
      {chatSkills.map((skill) => (
        <SkillChip
          key={`chat:${skill.id}`}
          name={skill.name}
          description={skill.description}
          persistent
          disabled={disabled}
          onRemove={onRemoveChatSkill ? () => onRemoveChatSkill(skill) : undefined}
        />
      ))}
      {pendingSkills.map((skill) => (
        <SkillChip
          key={`turn:${skill.id}`}
          name={skill.name}
          description={skill.description}
          persistent={false}
          disabled={disabled}
          onRemove={onRemovePendingSkill ? () => onRemovePendingSkill(skill) : undefined}
          onPin={onPinPendingSkill ? () => onPinPendingSkill(skill) : undefined}
        />
      ))}
    </div>
  );
}
