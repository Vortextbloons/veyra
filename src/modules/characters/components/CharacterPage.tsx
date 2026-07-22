import { useCallback, useEffect, useMemo, useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { useCharacterStore } from "../character-store";
import { useCharacterGroupStore } from "../character-group-store";
import { CharacterListPanel } from "./CharacterListPanel";
import { CharacterDetailView } from "./CharacterDetailView";
import { CharacterChatView } from "./CharacterChatView";
import { NewCharacterDialog } from "./NewCharacterDialog";
import { CharacterEditorDrawer } from "./CharacterEditorDrawer";
import { CharacterDirector } from "./CharacterDirector";
import { ImportPreviewModal } from "./ImportPreviewModal";
import { startCharacterChat } from "../character-chat";
import type { CharacterRecord } from "../character-types";
import { exportCharacterJson, exportCharacterCcv3, exportCharacterCcv3Png } from "../character-export";
import { GroupPage } from "./GroupPage";

type CharacterPane = "character" | "group";

export function CharacterPage() {
  const hydrateCharacters = useCharacterStore((s) => s.hydrateCharacters);
  const characters = useCharacterStore((s) => s.characters);
  const hydrationState = useCharacterStore((s) => s.hydrationState);
  const activeCharacterId = useCharacterStore((s) => s.activeCharacterId);
  const hydrateGroups = useCharacterGroupStore((s) => s.hydrateGroups);
  const [pane, setPane] = useState<CharacterPane>("character");
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [chatOpenRaw, setChatOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [directorOpen, setDirectorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [importPreview, setImportPreview] = useState<null | {
    source: "json" | "png";
    text?: string;
    bytes?: Uint8Array;
  }>(null);
  const [exportMenuFor, setExportMenuFor] = useState<CharacterRecord | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    void hydrateCharacters();
    void hydrateGroups();
  }, [hydrateCharacters, hydrateGroups]);

  const activeCharacter = useMemo(
    () => (activeCharacterId ? characters.find((c) => c.id === activeCharacterId) ?? null : null),
    [activeCharacterId, characters],
  );

  // Derive chatOpen: auto-close if the active character is missing.
  const chatOpen = chatOpenRaw && !!activeCharacter;

  // The editor, director, and export menu are only meaningful when a
  // character is active. Render them conditionally so deleting the active
  // character naturally hides them; no effect needed.
  const showEditor = editorOpen && !!activeCharacter;
  const showDirector = directorOpen && !!activeCharacter;
  const showExport = exportMenuFor && !!characters.find((c) => c.id === exportMenuFor.id);

  const handleStartChat = useCallback(() => {
    if (!activeCharacter) return;
    startCharacterChat(activeCharacter);
    setChatOpen(true);
  }, [activeCharacter]);

  const handleBackFromChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2400);
  };

  const handleDuplicate = (character: CharacterRecord) => {
    void (async () => {
      const now = new Date().toISOString();
      try {
        await useCharacterStore.getState().createCharacter({
          name: `${character.name} (copy)`,
          title: character.title,
          avatarPath: character.avatarPath,
          avatarColor: character.avatarColor,
          tagline: character.tagline,
          description: character.description,
          personality: character.personality,
          scenario: character.scenario,
          firstMessage: character.firstMessage,
          alternateGreetings: character.alternateGreetings,
          systemPrompt: character.systemPrompt,
          postHistoryInstructions: character.postHistoryInstructions,
          exampleMessages: character.exampleMessages,
          creatorNotes: character.creatorNotes,
          tags: character.tags,
          category: character.category,
          version: "1.0.0",
          spec: "veyra",
          creator: character.creator,
          source: "duplicate",
          isGlobal: character.isGlobal,
          projectId: character.projectId,
          lorebookEntries: character.lorebookEntries,
          chatDefaults: character.chatDefaults,
          createdAt: now,
          updatedAt: now,
        });
        showToast("Duplicated character.");
      } catch (err) {
        showToast(err instanceof Error ? err.message : String(err));
      }
    })();
  };

  const handleExportJson = (character: CharacterRecord) => {
    void exportCharacterJson(character);
    showToast("Copied Veyra JSON to clipboard.");
  };

  const handleExportCcv3 = (character: CharacterRecord) => {
    const text = exportCharacterCcv3(character);
    void navigator.clipboard.writeText(text);
    showToast("Copied CCv3 JSON to clipboard.");
  };

  const handleExportPng = async (character: CharacterRecord) => {
    try {
      await exportCharacterCcv3Png(character);
      showToast("PNG saved.");
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImport = async (source: "json" | "png") => {
    setMenuOpen(false);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { open } = await import("@tauri-apps/plugin-dialog");
      if (source === "json") {
        const path = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "Character Card", extensions: ["json"] }],
        });
        if (!path || typeof path !== "string") return;
        const text = await invoke<string>("read_text_file", { path });
        setImportPreview({ source: "json", text });
      } else {
        const path = await open({
          multiple: false,
          directory: false,
          filters: [{ name: "PNG image", extensions: ["png"] }],
        });
        if (!path || typeof path !== "string") return;
        const bytes = await invoke<number[]>("read_binary_file", { path });
        setImportPreview({ source: "png", bytes: new Uint8Array(bytes) });
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[14px] font-semibold tracking-tight">Characters</h1>
          <div className="ml-3 flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5 text-[11px]">
            <button
              type="button"
              onClick={() => setPane("character")}
              className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors ${
                pane === "character"
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-dim)] hover:text-white"
              }`}
              title="Single-character cards"
            >
              Characters
            </button>
            <button
              type="button"
              onClick={() => setPane("group")}
              className={`flex items-center gap-1.5 rounded px-2 py-1 font-medium transition-colors ${
                pane === "group"
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "text-[var(--color-text-dim)] hover:text-white"
              }`}
              title="Multi-character groups"
            >
              Groups
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pane === "character" && (
            <button
              type="button"
              onClick={() => setShowNewDialog(true)}
              className="flex h-8 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 text-[12px] font-medium text-white hover:brightness-110"
            >
              New character
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="grid size-7 place-items-center rounded-md border border-[var(--color-border)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              aria-label="More"
              title="More"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-40 mt-1.5 w-56 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl">
                  <button
                    type="button"
                    onClick={() => handleImport("json")}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-white hover:bg-white/5"
                  >
                    Import CCv3 JSON…
                  </button>
                  <button
                    type="button"
                    onClick={() => handleImport("png")}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] text-white hover:bg-white/5"
                  >
                    Import CCv3 PNG…
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {pane === "character" ? (
          <CharacterListPanel
            onCreate={() => setShowNewDialog(true)}
            onDuplicate={(c) => handleDuplicate(c)}
            onExport={(c) => setExportMenuFor(c)}
          />
        ) : null}
        {pane === "character" ? (
          hydrationState === "ready" ? (
            chatOpen && activeCharacter ? (
              <CharacterChatView
                key={activeCharacter.id}
                character={activeCharacter}
                onBack={handleBackFromChat}
              />
            ) : (
              <CharacterDetailView
                onStartChat={handleStartChat}
                onEdit={() => setEditorOpen(true)}
                onDirector={() => setDirectorOpen(true)}
              />
            )
          ) : (
            <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">
              Loading characters…
            </div>
          )
        ) : (
          <div className="flex min-w-0 flex-1 basis-0">
            <GroupPage />
          </div>
        )}
      </div>

      <NewCharacterDialog open={showNewDialog} onClose={() => setShowNewDialog(false)} />
      {showEditor && activeCharacter && (
        <CharacterEditorDrawer
          character={activeCharacter}
          open={showEditor}
          onClose={() => setEditorOpen(false)}
        />
      )}
      {showDirector && activeCharacter && (
        <CharacterDirector
          character={activeCharacter}
          onClose={() => setDirectorOpen(false)}
          onApplied={() => showToast("Applied AI suggestion.")}
        />
      )}
      {importPreview && (
        <ImportPreviewModal
          source={importPreview.source}
          text={importPreview.text}
          bytes={importPreview.bytes}
          existing={characters}
          onClose={() => setImportPreview(null)}
          onImported={(c) => {
            showToast(`Imported "${c.name}".`);
          }}
        />
      )}
      {showExport && exportMenuFor && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setExportMenuFor(null)}
        >
          <div
            className="flex w-[360px] max-w-[90vw] flex-col gap-2 rounded-xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-[13px] font-semibold text-white">Export {exportMenuFor.name}</h3>
              <button
                type="button"
                onClick={() => setExportMenuFor(null)}
                className="grid size-6 place-items-center rounded text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
              >
                <X className="size-3.5" />
              </button>
            </div>
            <p className="text-[11.5px] text-[var(--color-text-dim)]">
              Copy as JSON to the clipboard, or download a PNG with the CCv3 metadata embedded.
            </p>
            <button
              type="button"
              onClick={() => {
                handleExportJson(exportMenuFor);
                setExportMenuFor(null);
              }}
              className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left text-[12.5px] text-white hover:bg-white/5"
            >
              Copy Veyra JSON
            </button>
            <button
              type="button"
              onClick={() => {
                handleExportCcv3(exportMenuFor);
                setExportMenuFor(null);
              }}
              className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left text-[12.5px] text-white hover:bg-white/5"
            >
              Copy CCv3 JSON
            </button>
            <button
              type="button"
              onClick={() => {
                void handleExportPng(exportMenuFor);
                setExportMenuFor(null);
              }}
              className="flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-left text-[12.5px] text-white hover:bg-white/5"
            >
              Download PNG with CCv3
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-50 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3 py-2 text-[12px] text-white shadow-2xl">
          {toast}
        </div>
      )}
    </main>
  );
}

export default CharacterPage;
