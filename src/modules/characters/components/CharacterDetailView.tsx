import { useMemo, useState } from "react";
import { Drama, Edit3, Eye, MessageSquare, Play, Tag, User } from "lucide-react";
import { useCharacterStore } from "../character-store";
import { useChatStore } from "@/stores/chat-store";
import type { CharacterRecord } from "../character-types";
import { getAvatarGradient } from "../character-gradients";

type TabId = "preview" | "persona" | "greeting" | "examples" | "system";

const TABS: { id: TabId; label: string }[] = [
  { id: "preview", label: "Preview" },
  { id: "persona", label: "Persona" },
  { id: "greeting", label: "First Message" },
  { id: "examples", label: "Examples" },
  { id: "system", label: "System" },
];

function GradientAvatar({ character, size = "lg" }: { character: CharacterRecord; size?: "lg" | "md" }) {
  const sizeClass =
    size === "lg"
      ? "size-16 text-[18px]"
      : "size-12 text-[14px]";
  const gradient = getAvatarGradient(character.avatarColor);
  const initials = (character.name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={`grid place-items-center rounded-2xl ${gradient} font-semibold text-white ${sizeClass}`}
    >
      {initials}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2 text-[11.5px]">
      <span className="font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </span>
      <span className="text-white">{value}</span>
    </div>
  );
}

function MarkdownBlock({ content, empty }: { content: string; empty: string }) {
  if (!content.trim()) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-dim)]/60">
        {empty}
      </div>
    );
  }
  return (
    <pre className="whitespace-pre-wrap rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-3 text-[12.5px] leading-relaxed text-white">
      {content}
    </pre>
  );
}

function PersonaTab({ character }: { character: CharacterRecord }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Description
        </h3>
        <MarkdownBlock content={character.description} empty="No description set." />
      </section>
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Personality
        </h3>
        <MarkdownBlock content={character.personality} empty="No personality summary set." />
      </section>
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Scenario
        </h3>
        <MarkdownBlock content={character.scenario} empty="No default scenario set." />
      </section>
      {character.creatorNotes && (
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            Creator Notes
          </h3>
          <MarkdownBlock content={character.creatorNotes} empty="" />
        </section>
      )}
    </div>
  );
}

function GreetingTab({ character }: { character: CharacterRecord }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          First Message
        </h3>
        <MarkdownBlock content={character.firstMessage} empty="No greeting set." />
      </section>
      {character.alternateGreetings.length > 0 && (
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            Alternate Greetings
          </h3>
          <div className="flex flex-col gap-2">
            {character.alternateGreetings.map((greeting, idx) => (
              <div key={idx}>
                <div className="mb-1 text-[10.5px] uppercase tracking-wide text-[var(--color-text-dim)]/60">
                  #{idx + 1}
                </div>
                <MarkdownBlock content={greeting} empty="" />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ExamplesTab({ character }: { character: CharacterRecord }) {
  if (character.exampleMessages.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] px-4 py-6 text-center text-[12px] text-[var(--color-text-dim)]">
        No example messages set.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {character.exampleMessages.map((ex, idx) => (
        <div
          key={idx}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-3"
        >
          <div className="mb-1.5 text-[10.5px] uppercase tracking-wide text-[var(--color-text-dim)]">
            Example #{idx + 1}
          </div>
          <div className="mb-2">
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]/80">
              User
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-white">
              {ex.user}
            </div>
          </div>
          <div>
            <div className="text-[10.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]/80">
              Assistant
            </div>
            <div className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-white">
              {ex.assistant}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SystemTab({ character }: { character: CharacterRecord }) {
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          System Prompt Override
        </h3>
        <MarkdownBlock content={character.systemPrompt} empty="No system prompt override. The global default applies." />
      </section>
      {character.postHistoryInstructions && (
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            Post-History Instructions
          </h3>
          <MarkdownBlock content={character.postHistoryInstructions} empty="" />
        </section>
      )}
      <p className="text-[11.5px] text-[var(--color-text-dim)]/70">
        System overrides and post-history instructions are injected into the chat context
        when this character is active.
      </p>
    </div>
  );
}

function PreviewTab({ character }: { character: CharacterRecord }) {
  const conversations = useChatStore((s) => s.conversations);
  const setActiveConversationId = useChatStore((s) => s.setActiveConversationId);
  const recentChats = useMemo(() => {
    return conversations
      .filter((c) => c.characterId === character.id)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);
  }, [conversations, character.id]);
  return (
    <div className="flex flex-col gap-4">
      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Opening
        </h3>
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-3">
          <div className="mb-2 flex items-center gap-2">
            <GradientAvatar character={character} size="md" />
            <div>
              <div className="text-[12.5px] font-medium text-white">{character.name}</div>
              <div className="text-[10.5px] text-[var(--color-text-dim)]">
                {character.title || "Character"}
              </div>
            </div>
          </div>
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-white">
            {character.firstMessage || "(no first message)"}
          </div>
        </div>
      </section>

      {character.scenario && (
        <section>
          <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            Default Scene
          </h3>
          <MarkdownBlock content={character.scenario} empty="" />
        </section>
      )}

      <section>
        <h3 className="mb-1.5 text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
          Recent Chats
        </h3>
        {recentChats.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-2 text-[12px] text-[var(--color-text-dim)]/60">
            No chats yet. Click “Chat with {character.name}” above to start one.
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {recentChats.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setActiveConversationId(c.id)}
                className="flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-3 py-2 text-left text-[12.5px] hover:bg-white/[0.03]"
              >
                <span className="truncate text-white">{c.title}</span>
                <span className="shrink-0 text-[10.5px] text-[var(--color-text-dim)]">
                  {new Date(c.updatedAt).toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function WelcomeScreen() {
  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
          <div className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/10 ring-1 ring-inset ring-indigo-400/30">
            <Drama className="size-5 text-indigo-300" />
          </div>
          <div>
            <h2 className="text-[15px] font-semibold text-white">Characters</h2>
            <p className="mt-1.5 text-[12.5px] text-[var(--color-text-dim)]">
              Create custom character cards for roleplay. Each character has a persona, a
              first message, and its own lorebook. Pick a character from the list to view
              and edit it.
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-[11.5px] text-[var(--color-text-dim)]">
            <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1">
              <Edit3 className="size-3" /> Markdown persona
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1">
              <MessageSquare className="size-3" /> Per-character lorebook
            </span>
            <span className="flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-1">
              <Tag className="size-3" /> Tags and categories
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CharacterHeader({ character, onStartChat }: { character: CharacterRecord; onStartChat: () => void }) {
  const tags = character.tags;
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--color-border)] px-6 py-5">
      <div className="flex items-start gap-3">
        <GradientAvatar character={character} size="lg" />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[16px] font-semibold text-white">
              {character.name}
            </h2>
            <span className="rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
              v{character.version}
            </span>
            {character.spec === "chara_card_v3" && (
              <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-300">
                CCv3
              </span>
            )}
            {!character.isGlobal && (
              <span className="rounded border border-indigo-500/30 bg-indigo-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-indigo-300">
                Project
              </span>
            )}
          </div>
          {character.title && (
            <div className="text-[12.5px] text-[var(--color-text-dim)]">
              {character.title}
            </div>
          )}
          {character.tagline && (
            <div className="mt-1 text-[12.5px] text-white/80">{character.tagline}</div>
          )}
        </div>
        <button
          type="button"
          onClick={onStartChat}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12.5px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110"
        >
          <Play className="size-3.5" />
          Chat with {character.name}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <MetaRow label="Creator" value={character.creator} />
        <MetaRow label="Category" value={character.category} />
        {(character.stats?.totalChats ?? 0) > 0 && (
          <MetaRow label="Chats" value={String(character.stats!.totalChats)} />
        )}
        {character.stats?.lastUsedAt && (
          <MetaRow
            label="Last used"
            value={new Date(character.stats.lastUsedAt).toLocaleDateString()}
          />
        )}
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag, i) => (
            <span
              key={i}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-0.5 text-[10.5px] font-medium text-[var(--color-text-dim)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function CharacterTabs({
  character,
  onStartChat,
}: {
  character: CharacterRecord;
  onStartChat: () => void;
}) {
  const [activeTab, setActiveTab] = useState<TabId>("preview");
  return (
    <>
      <CharacterHeader character={character} onStartChat={onStartChat} />
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg)] px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-medium transition-colors ${
              activeTab === tab.id
                ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "text-[var(--color-text-dim)] hover:bg-white/[0.03] hover:text-white"
            }`}
          >
            {tab.id === "preview" && <Eye className="size-3.5" />}
            {tab.id === "persona" && <User className="size-3.5" />}
            {tab.id === "greeting" && <MessageSquare className="size-3.5" />}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto bg-[var(--color-bg)]">
        <div className="w-full p-6">
          {activeTab === "preview" && <PreviewTab character={character} />}
          {activeTab === "persona" && <PersonaTab character={character} />}
          {activeTab === "greeting" && <GreetingTab character={character} />}
          {activeTab === "examples" && <ExamplesTab character={character} />}
          {activeTab === "system" && <SystemTab character={character} />}
        </div>
      </div>
    </>
  );
}

export function CharacterDetailView({ onStartChat }: { onStartChat: () => void }) {
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId);
  const characters = useCharacterStore((s) => s.characters);
  const character = activeCharacterId
    ? characters.find((c) => c.id === activeCharacterId) ?? null
    : null;

  if (!character) {
    return <WelcomeScreen />;
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      {/* Tabs + tab content (keyed on character id so state resets on switch) */}
      <CharacterTabs key={character.id} character={character} onStartChat={onStartChat} />
    </section>
  );
}
