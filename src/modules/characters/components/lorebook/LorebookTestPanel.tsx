import { useMemo, useState } from "react";
import { TestTube2 } from "lucide-react";
import type {
  CharacterLorebookEntry,
  CharacterRecord,
} from "../../character-types";
import { testLorebook } from "../../ai-assist/lorebook-tools";
import { useChatStore } from "@/stores/chat-store";
import { PRIORITY_LABELS } from "./constants";

export function LorebookTestPanel({
  character,
  entries,
}: {
  character: CharacterRecord;
  entries: CharacterLorebookEntry[];
}) {
  const conversations = useChatStore((s) => s.conversations);
  const [conversationId, setConversationId] = useState<string>("");
  const boundConversations = useMemo(
    () => conversations.filter((c) => c.characterId === character.id),
    [conversations, character.id],
  );
  const target = conversationId
    ? conversations.find((c) => c.id === conversationId)
    : boundConversations[0];
  const report = useMemo(() => {
    if (!target) return null;
    return testLorebook(entries, target.messages, {
      scanDepth: character.chatDefaults?.scanDepth,
      maxEntries: character.chatDefaults?.maxLorebookEntries,
    });
  }, [target, entries, character.chatDefaults]);

  return (
    <div className="rounded-md border border-indigo-400/30 bg-indigo-500/[0.06] p-3">
      <div className="mb-2 flex items-center gap-2">
        <TestTube2 className="size-3.5 text-indigo-300" />
        <h4 className="text-[12px] font-semibold text-white">Test against history</h4>
        <span className="ml-auto text-[10.5px] text-[var(--color-text-dim)]">
          {report?.totalEntries ?? entries.length} entries · scan depth {character.chatDefaults?.scanDepth ?? 4}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        <select
          value={conversationId}
          onChange={(e) => setConversationId(e.target.value)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white"
        >
          <option value="">Auto-pick most recent</option>
          {boundConversations.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title} ({c.messages.length} messages)
            </option>
          ))}
        </select>
        {boundConversations.length === 0 && (
          <p className="text-[11.5px] text-[var(--color-text-dim)]">
            No chats bound to this character yet. Start a chat to test against real history.
          </p>
        )}
        {report && (
          <div className="flex flex-col gap-1.5">
            <p className="text-[11px] text-[var(--color-text-dim)]">
              {report.matched.length} matched{report.budgetExceeded ? " (budget exceeded)" : ""}.
            </p>
            {report.matched.length === 0 && target && target.messages.length > 0 && (
              <p className="text-[11px] text-[var(--color-text-dim)]">
                No triggers fired. Try lowering scan depth or simplifying keys.
              </p>
            )}
            {report.matched.map((m, i) => (
              <div
                key={i}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-2"
              >
                <div className="mb-1 flex items-center gap-1.5">
                  <span className="rounded border border-emerald-300/20 bg-emerald-300/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-200">
                    {m.entry.comment || m.entry.keys.join(",")}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--color-text-dim)]">
                    {PRIORITY_LABELS[m.entry.priority]}
                  </span>
                </div>
                <div className="whitespace-pre-wrap text-[11.5px] text-white/85">{m.entry.content}</div>
                {m.snippet && (
                  <div className="mt-1 truncate text-[10.5px] italic text-[var(--color-text-dim)]">
                    …{m.snippet}…
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
