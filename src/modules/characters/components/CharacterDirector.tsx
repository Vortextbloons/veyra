// ── Character Director ──────────────────────────────────────────────────────
//
// A full-screen split view: free-form co-authoring chat on the left, pending
// changes panel on the right. Director sessions are persisted to localStorage
// per character id (see ai-assist-store).

import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { X, Loader2, WandSparkles, ArrowLeft, Sparkles } from "lucide-react";
import type { CharacterRecord } from "../character-types";
import { useCharacterAssistStore, selectDirectorSessionFor } from "../ai-assist/ai-assist-store";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../ai-assist/use-assist-job";
import type { CharacterDirectorMessage } from "../ai-assist/ai-assist-types";
import { newId } from "@/lib/id";
import { useCharacterStore } from "../character-store";

interface CharacterDirectorProps {
  character: CharacterRecord;
  onClose: () => void;
  onApplied?: () => void;
}

export function CharacterDirector({ character, onClose, onApplied }: CharacterDirectorProps) {
  const session = useCharacterAssistStore((s) => selectDirectorSessionFor(s, character.id));
  const createDirectorSession = useCharacterAssistStore((s) => s.createDirectorSession);
  const appendDirectorMessage = useCharacterAssistStore((s) => s.appendDirectorMessage);
  const clearDirectorSession = useCharacterAssistStore((s) => s.clearDirectorSession);
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);

  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const pendingChanges = useCharacterAssistStore(
    useShallow((s) =>
      Object.values(s.pendingChanges).filter(
        (c) => c.characterId === character.id && c.status === "pending",
      ),
    ),
  );
  const markPendingChangeApplied = useCharacterAssistStore((s) => s.markPendingChangeApplied);
  const discardPendingChange = useCharacterAssistStore((s) => s.discardPendingChange);

  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sessionIdRef = useRef<string | null>(session?.id ?? null);

  // Ensure a session exists.
  useEffect(() => {
    if (!session) {
      const id = createDirectorSession(character.id);
      sessionIdRef.current = id;
    } else {
      sessionIdRef.current = session.id;
    }
  }, [session, character.id, createDirectorSession]);

  // Keep the draft synced to the latest character when reloaded. The lint
  // rule bans sync setState in an effect, so we derive by comparing to the
  // last value we saw. This pattern is recommended by the React docs:
  // https://react.dev/reference/react/useState#storing-information-from-previous-renders
  const [draft, setDraft] = useState<CharacterRecord>(character);
  const [lastDraftId, setLastDraftId] = useState(character.id);
  if (lastDraftId !== character.id) {
    setLastDraftId(character.id);
    setDraft(character);
  }

  // Auto-scroll on new message.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [session?.messages.length, job.buffer]);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const sid = sessionIdRef.current ?? session?.id ?? null;
    if (!sid) return;
    const userMessage: CharacterDirectorMessage = {
      id: newId("dmsg"),
      role: "user",
      content: text,
      timestamp: Date.now(),
    };
    appendDirectorMessage(sid, userMessage);
    runner.start(
      {
        action: "director_turn",
        characterId: character.id,
        options: { directorPrompt: text, sendCurrentContext: true },
        directorHistory: [
          ...((session?.messages ?? []).map((m) => ({
            role: m.role,
            content: m.content,
          })) as Array<{ role: "user" | "assistant"; content: string }>),
          { role: "user", content: text },
        ],
      },
      { character, userPrompt: text },
    );
  }, [input, session, character, appendDirectorMessage, runner]);

  // When the job completes, append the assistant message and create pending
  // changes for any non-empty cardPatch.
  useEffect(() => {
    if (!job.result) return;
    const sid = sessionIdRef.current;
    if (!sid) return;
    const reply = job.result.text ?? "";
    if (reply) {
      appendDirectorMessage(sid, {
        id: newId("dmsg"),
        role: "assistant",
        content: reply,
        timestamp: Date.now(),
      });
    }
    const cardPatch = (job.result.card as Record<string, unknown> | null) ?? null;
    if (cardPatch) {
      const addPendingChange = useCharacterAssistStore.getState().addPendingChange;
      for (const [field, value] of Object.entries(cardPatch)) {
        if (value === undefined || value === null) continue;
        addPendingChange({
          characterId: character.id,
          field,
          label: humanLabel(field),
          before: (draft as unknown as Record<string, unknown>)[field],
          after: value,
          source: "director_turn",
        });
      }
    }
    if (job.result.lorebookEntries && job.result.lorebookEntries.length > 0) {
      const addPendingChange = useCharacterAssistStore.getState().addPendingChange;
      addPendingChange({
        characterId: character.id,
        field: "lorebookEntries",
        label: "Lorebook",
        before: draft.lorebookEntries ?? [],
        after: [...(draft.lorebookEntries ?? []), ...job.result.lorebookEntries],
        source: "director_turn",
      });
    }
    job.clear();
    // job is intentionally read inside the effect (job.clear is a stable
    // action). We only re-run when the result, character, or draft changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.result, character.id, draft, appendDirectorMessage]);

  const applyAll = async () => {
    if (pendingChanges.length === 0) return;
    const ok = window.confirm(
      `Apply ${pendingChanges.length} AI suggestion${pendingChanges.length === 1 ? "" : "s"} to this character? This will overwrite the listed fields.`,
    );
    if (!ok) return;
    const next: Record<string, unknown> = { ...draft };
    for (const change of pendingChanges) {
      next[change.field] = change.after;
    }
    setDraft(next as unknown as CharacterRecord);
    await updateCharacter({
      id: character.id,
      ...(next as unknown as Partial<CharacterRecord>),
      updatedAt: new Date().toISOString(),
    });
    for (const change of pendingChanges) {
      markPendingChangeApplied(change.id);
    }
    onApplied?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <Sparkles className="size-3.5 text-emerald-300" />
          <div>
            <h1 className="text-[13.5px] font-semibold text-white">
              Develop with AI · {character.name}
            </h1>
            <p className="text-[11px] text-[var(--color-text-dim)]">
              Conversational co-authoring. Suggestions appear on the right and
              are never applied automatically.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (session && session.messages.length > 0) {
                if (!window.confirm("Clear this conversation? Pending changes are kept.")) return;
                clearDirectorSession(session.id);
              }
            }}
            className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          >
            Clear chat
          </button>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
            aria-label="Close"
          >
            <X className="size-3.5" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-1/2 min-w-0 flex-col border-r border-[var(--color-border)]">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
            {session?.messages.length === 0 && (
              <div className="rounded-md border border-dashed border-[var(--color-border)] p-4 text-center text-[12px] text-[var(--color-text-dim)]">
                <p>
                  Start by asking for what you want to change — for example:
                </p>
                <p className="mt-2 italic">
                  "Make the description more atmospheric and add a contradiction
                  between her duty and her empathy."
                </p>
              </div>
            )}
            {session?.messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {job.running && job.buffer && (
              <MessageBubble
                message={{
                  id: "streaming",
                  role: "assistant",
                  content: job.buffer,
                  timestamp: 0,
                }}
                streaming
              />
            )}
          </div>
          <form
            className="flex items-end gap-2 border-t border-[var(--color-border)] p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (job.running) return;
              send();
            }}
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (job.running) return;
                  send();
                }
              }}
              rows={2}
              placeholder="Ask the model to develop the character…"
              className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[12.5px] text-white focus:border-emerald-300/40 focus:outline-none"
            />
            <button
              type="submit"
              disabled={job.running || !input.trim()}
              className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-500/85 px-3 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgba(16,185,129,0.4)] hover:brightness-110 disabled:opacity-50"
            >
              {job.running && <Loader2 className="size-3 animate-spin" />}
              Send
            </button>
            {job.running && (
              <button
                type="button"
                onClick={runner.cancel}
                className="inline-flex h-9 items-center gap-1.5 rounded-md border border-[var(--color-border)] px-2.5 text-[12px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              >
                Stop
              </button>
            )}
          </form>
        </div>

        <div className="flex w-1/2 min-w-0 flex-col">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
            <h2 className="text-[12px] font-medium text-white">Pending changes</h2>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-0.5 text-[10.5px] text-emerald-200">
                {pendingChanges.length}
              </span>
              <button
                type="button"
                onClick={applyAll}
                disabled={pendingChanges.length === 0}
                className="rounded-md bg-emerald-500/85 px-2.5 py-1 text-[11.5px] font-medium text-white disabled:opacity-50"
              >
                Apply all
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {pendingChanges.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-[12px] text-[var(--color-text-dim)]">
                <div>
                  <WandSparkles className="mx-auto mb-2 size-6 opacity-50" />
                  <p>No pending changes yet.</p>
                  <p className="mt-1">The model's proposals will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {pendingChanges.map((change) => (
                  <div
                    key={change.id}
                    className="rounded-md border border-emerald-300/25 bg-emerald-300/[0.04] p-2.5"
                  >
                    <div className="mb-1 flex items-center justify-between text-[10.5px] uppercase tracking-wide text-emerald-200/80">
                      <span>{change.label}</span>
                      <span className="text-emerald-200/60">from {change.source}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11.5px]">
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
                          Before
                        </div>
                        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-1.5 text-white/70">
                          {formatValue(change.before)}
                        </div>
                      </div>
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-emerald-200/80">
                          After
                        </div>
                        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded border border-emerald-300/20 bg-emerald-300/[0.05] p-1.5 text-white">
                          {formatValue(change.after)}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          const next = {
                            ...draft,
                            [change.field]: change.after,
                          } as CharacterRecord;
                          setDraft(next);
                          void updateCharacter({
                            id: character.id,
                            ...(next as unknown as Record<string, unknown>),
                            updatedAt: new Date().toISOString(),
                          } as never).then(() => {
                            markPendingChangeApplied(change.id);
                            onApplied?.();
                          });
                        }}
                        className="inline-flex items-center gap-1 rounded-md bg-emerald-500/85 px-2.5 py-1 text-[11.5px] font-medium text-white"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => discardPendingChange(change.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2.5 py-1 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                      >
                        Discard
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="border-t border-[var(--color-border)] p-3 text-[11px] text-[var(--color-text-dim)]">
            <p>
              Applied suggestions write to the character immediately. Discarded
              suggestions are removed from the panel but the model still sees
              them in its memory of this session.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  streaming,
}: {
  message: CharacterDirectorMessage;
  streaming?: boolean;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`mb-3 flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[12.5px] leading-relaxed ${
          isUser
            ? "bg-[var(--color-accent)] text-white"
            : "border border-emerald-300/20 bg-emerald-300/[0.04] text-white/90"
        }`}
      >
        {streaming && (
          <div className="mb-1 flex items-center gap-1.5 text-[10.5px] uppercase tracking-wide text-emerald-200/80">
            <Loader2 className="size-3 animate-spin" />
            Streaming
          </div>
        )}
        <div className="whitespace-pre-wrap">{message.content || (streaming ? "…" : "")}</div>
      </div>
    </div>
  );
}

function humanLabel(field: string): string {
  const map: Record<string, string> = {
    name: "Name",
    title: "Title",
    tagline: "Tagline",
    description: "Description",
    personality: "Personality",
    scenario: "Scenario",
    firstMessage: "First message",
    alternateGreetings: "Alternate greetings",
    exampleMessages: "Example dialogues",
    systemPrompt: "System prompt",
    postHistoryInstructions: "Post-history instructions",
    creatorNotes: "Creator notes",
    tags: "Tags",
    category: "Category",
    version: "Version",
    lorebookEntries: "Lorebook",
  };
  return map[field] ?? field;
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "(empty)";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) {
    if (v.length === 0) return "(empty)";
    return v
      .map((item) =>
        typeof item === "string"
          ? item
          : item && typeof item === "object"
            ? JSON.stringify(item, null, 2)
            : String(item),
      )
      .join("\n\n");
  }
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}
