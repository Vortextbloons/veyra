import { useCallback, useEffect, useMemo, useState } from "react";
import { Drama, Plus, Sparkles } from "lucide-react";
import { useCharacterStore } from "../character-store";
import { CharacterListPanel } from "./CharacterListPanel";
import { CharacterDetailView } from "./CharacterDetailView";
import { CharacterChatView } from "./CharacterChatView";
import { NewCharacterDialog } from "./NewCharacterDialog";
import { startCharacterChat } from "../character-chat";

export function CharacterPage() {
  const hydrateCharacters = useCharacterStore((s) => s.hydrateCharacters);
  const characters = useCharacterStore((s) => s.characters);
  const hydrationState = useCharacterStore((s) => s.hydrationState);
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [chatOpenRaw, setChatOpen] = useState(false);

  useEffect(() => {
    void hydrateCharacters();
  }, [hydrateCharacters]);

  const activeCharacter = useMemo(
    () => (activeCharacterId ? characters.find((c) => c.id === activeCharacterId) ?? null : null),
    [activeCharacterId, characters],
  );

  // Derive chatOpen: auto-close if the active character is missing.
  const chatOpen = chatOpenRaw && !!activeCharacter;

  const handleStartChat = useCallback(() => {
    if (!activeCharacter) return;
    startCharacterChat(activeCharacter);
    setChatOpen(true);
  }, [activeCharacter]);

  const handleBackFromChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-inset ring-indigo-400/30">
            <Drama className="size-3.5 text-indigo-300" />
          </div>
          <h1 className="text-[14px] font-semibold tracking-tight">Characters</h1>
          <span className="ml-2 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
            {characters.length} total
          </span>
          <span className="ml-1 inline-flex items-center gap-1 rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
            <Sparkles className="size-2.5" /> roleplay
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowNewDialog(true)}
          className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110"
        >
          <Plus className="size-3.5" />
          New Character
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <CharacterListPanel onCreate={() => setShowNewDialog(true)} />
        {hydrationState === "ready" ? (
          chatOpen && activeCharacter ? (
            <CharacterChatView
              key={activeCharacter.id}
              character={activeCharacter}
              onBack={handleBackFromChat}
            />
          ) : (
            <CharacterDetailView onStartChat={handleStartChat} />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">
            Loading characters…
          </div>
        )}
      </div>

      <NewCharacterDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
    </main>
  );
}

export default CharacterPage;
