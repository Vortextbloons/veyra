import { useState, useEffect } from "react";
import {
  Bot,
  Tag,
  Plus,
  X,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useEmailStore } from "../email-store";
import { emailListTags } from "../tauri-commands";
import { getTaskTypeIcon, getTaskTypeLabel, renderClassificationDetails, renderUrgencyDetails, renderSpamDetails } from "./ai-output-helpers";
import type { EmailAiOutput, EmailTag } from "../email-types";

export function AiOutputsPanel({ outputs }: { outputs: EmailAiOutput[] }) {
  const [expanded, setExpanded] = useState(false);
  const tags = useEmailStore((s) => s.tags);
  const messageTags = useEmailStore((s) => s.messageTags);
  const applyTag = useEmailStore((s) => s.applyTag);
  const removeTagFromMessage = useEmailStore((s) => s.removeTagFromMessage);
  const loadMessageTags = useEmailStore((s) => s.loadMessageTags);
  const loadTags = useEmailStore((s) => s.loadTags);
  const createTag = useEmailStore((s) => s.createTag);
  const [tagInput, setTagInput] = useState("");
  const [showTagDropdown, setShowTagDropdown] = useState(false);

  const byType = new Map<string, EmailAiOutput>();
  for (const o of outputs) {
    if (!byType.has(o.taskType)) byType.set(o.taskType, o);
  }

  const items = [...byType.entries()].map(([type, output]) => ({
    type,
    output,
    icon: getTaskTypeIcon(type),
    label: getTaskTypeLabel(type),
  }));

  const firstMessageId = outputs[0]?.messageId;
  const appliedTags = firstMessageId ? (messageTags[firstMessageId] ?? []) : [];

  useEffect(() => {
    if (expanded && firstMessageId) {
      void loadMessageTags(firstMessageId);
      void loadTags();
    }
  }, [expanded, firstMessageId, loadMessageTags, loadTags]);

  const filteredTagSuggestions = tagInput.length > 0
    ? tags.filter(
        (t) =>
          t.name.toLowerCase().includes(tagInput.toLowerCase()) &&
          !appliedTags.some((at) => at.id === t.id),
      )
    : [];

  const handleAddTag = (tag: EmailTag) => {
    if (firstMessageId) {
      void applyTag(firstMessageId, tag.id, "user");
      setTagInput("");
      setShowTagDropdown(false);
    }
  };

  const handleRemoveTag = (tagId: string) => {
    if (firstMessageId) {
      void removeTagFromMessage(firstMessageId, tagId);
    }
  };

  const handleCreateAndApplyTag = async () => {
    if (!firstMessageId || !tagInput.trim()) return;
    const name = tagInput.trim();
    const existing = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      handleAddTag(existing);
      return;
    }
    try {
      await createTag({ name, source: "user" });
      const freshTags = await emailListTags();
      const created = freshTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (created) {
        await applyTag(firstMessageId, created.id, "user");
      }
      setTagInput("");
      setShowTagDropdown(false);
    } catch {
      // Silently fail — store already captures errors.
    }
  };

  const hasExactMatch = tags.some(
    (t) => t.name.toLowerCase() === tagInput.toLowerCase(),
  );

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-panel)]/50">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-4 py-2 text-left text-[11px] text-[var(--color-text-dim)] hover:bg-white/[0.02]"
      >
        <Bot className="size-3 text-[var(--color-accent)]" />
        <span className="font-medium">AI Analysis</span>
        <span className="text-[10px] opacity-60">{byType.size} result{byType.size === 1 ? "" : "s"}</span>
        <div className="flex-1" />
        {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      {expanded && (
        <div className="space-y-1 px-4 pb-3">
          {items.map(({ type, output, icon, label }) => (
            <div key={type} className="flex items-start gap-2 rounded-md p-2 text-[11px]">
              {icon}
              <div className="min-w-0 flex-1">
                <div className="font-medium text-[var(--color-text)]">{label}</div>
                <div className="text-[var(--color-text-dim)]">{output.displayText || "No result"}</div>
                {type === "classification" && renderClassificationDetails(output)}
                {type === "urgency_score" && renderUrgencyDetails(output)}
                {type === "spam_score" && renderSpamDetails(output)}
              </div>
            </div>
          ))}

          {/* Tag correction section */}
          {firstMessageId && (
            <div className="mt-2 rounded-md border border-[var(--color-border)]/50 p-2">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text)]">
                <Tag className="size-3" />
                Tags
              </div>
              <div className="flex flex-wrap gap-1">
                {appliedTags.map((tag) => (
                  <span
                    key={tag.id}
                    className="inline-flex items-center gap-1 rounded-full bg-white/[0.08] px-2 py-0.5 text-[10px] text-[var(--color-text-dim)]"
                    style={tag.color ? { borderLeft: `2px solid ${tag.color}` } : undefined}
                  >
                    {tag.name}
                    {tag.source === "ai" && (
                      <span className="text-[8px] opacity-40">AI</span>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag.id)}
                      className="ml-0.5 rounded-full p-0.5 hover:bg-white/10"
                      title="Remove tag"
                    >
                      <X className="size-2.5" />
                    </button>
                  </span>
                ))}
                {appliedTags.length === 0 && (
                  <span className="text-[10px] text-[var(--color-text-dim)]/50">No tags</span>
                )}
              </div>
              <div className="relative mt-2">
                <div className="flex items-center gap-1">
                  <Plus className="size-3 text-[var(--color-text-dim)]/50" />
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => {
                      setTagInput(e.target.value);
                      setShowTagDropdown(true);
                    }}
                    onFocus={() => setShowTagDropdown(true)}
                    onBlur={() => setTimeout(() => setShowTagDropdown(false), 150)}
                    placeholder="Add tag..."
                    className="min-w-0 flex-1 bg-transparent text-[10.5px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/40 outline-none"
                  />
                </div>
                {showTagDropdown && (filteredTagSuggestions.length > 0 || (tagInput.trim() && !hasExactMatch)) && (
                  <div className="absolute left-0 top-full z-10 mt-1 max-h-[120px] w-full overflow-y-auto rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] shadow-lg">
                    {filteredTagSuggestions.map((tag) => (
                      <button
                        key={tag.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          handleAddTag(tag);
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10.5px] text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-[var(--color-text)]"
                      >
                        {tag.color && (
                          <span
                            className="size-2 rounded-full"
                            style={{ backgroundColor: tag.color }}
                          />
                        )}
                        <span>{tag.name}</span>
                        <span className="ml-auto text-[9px] opacity-40">{tag.source}</span>
                      </button>
                    ))}
                    {tagInput.trim() && !hasExactMatch && (
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          void handleCreateAndApplyTag();
                        }}
                        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[10.5px] text-[var(--color-accent)] hover:bg-white/[0.04]"
                      >
                        <Plus className="size-3" />
                        <span>Create "{tagInput.trim()}"</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
