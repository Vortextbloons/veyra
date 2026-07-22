import { Drama } from "lucide-react";
import { ChatPanel } from "@/app/components/chat-panel";
import { useCharacterStore } from "../character-store";
import { useCharacterChatPipeline } from "@/lib/use-character-chat-pipeline";
import { regenerateCharacterGreeting } from "../character-chat";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { getAvatarGradient } from "../character-gradients";
import type { CharacterRecord } from "../character-types";
import { useWorkspaceModeChange } from "@/lib/workspace-mode";

function CharacterAvatar({
  character,
  size = "md",
}: {
  character: { name: string; avatarColor?: string };
  size?: "sm" | "md";
}) {
  const sizeClass = size === "sm" ? "size-6 text-[10.5px]" : "size-9 text-[12.5px]";
  const gradient = getAvatarGradient(character.avatarColor);
  const initials = (character.name || "?").trim().slice(0, 2).toUpperCase();
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full ${gradient} font-semibold text-white ${sizeClass}`}
    >
      {initials}
    </div>
  );
}

export function CharacterChatView({
  character,
  onBack,
}: {
  character: CharacterRecord;
  onBack: () => void;
}) {
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId) ?? null,
  );
  const characters = useCharacterStore((s) => s.characters);
  const unbindCharacter = useChatStore((s) => s.unbindCharacter);
  const pipeline = useCharacterChatPipeline();
  const handleModeChange = useWorkspaceModeChange();

  const isCharacterChatActive =
    !!activeConversation && activeConversation.characterId === character.id;

  const liveCharacter: CharacterRecord =
    characters.find((c) => c.id === character.id) ?? character;

  const snapshot = activeConversation?.characterSnapshot;
  const displayName = snapshot?.name || liveCharacter.name || "Character";
  const displayTitle = snapshot?.title || liveCharacter.title;
  const displayColor = snapshot?.avatarColor ?? liveCharacter.avatarColor;
  const isDeleted = !characters.some((c) => c.id === character.id);

  const onRegenerateGreeting = () => {
    if (!activeConversation) return;
    regenerateCharacterGreeting(activeConversation.id, liveCharacter, { avoidCurrent: true });
  };

  const onConvertToPlain = () => {
    if (!activeConversation) return;
    unbindCharacter(activeConversation.id);
    onBack();
  };

  const titleAccessory = (
    <div className="flex items-center gap-1.5">
      <CharacterAvatar
        character={{ name: displayName, avatarColor: displayColor }}
        size="sm"
      />
      <span className="hidden text-[10.5px] uppercase tracking-wide text-[var(--color-text-dim)] md:inline">
        {displayTitle || "Character"}
      </span>
    </div>
  );

  const headerActions = (
    <>
      <button
        type="button"
        onClick={onRegenerateGreeting}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Regenerate greeting"
      >
        New greeting
      </button>
      <button
        type="button"
        onClick={onConvertToPlain}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Unbind from character"
      >
        Unbind
      </button>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Back to character"
      >
        Back
      </button>
    </>
  );

  if (!isCharacterChatActive) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-[var(--color-bg)]">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center text-[12.5px] text-[var(--color-text-dim)]">
          <Drama className="size-7 text-[var(--color-text-dim)]/40" />
          <p>Start a chat from the header to begin a conversation with this character.</p>
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {isDeleted && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-200">
          <strong className="font-semibold">{displayName}</strong> is no longer available.
          You can keep chatting without a persona, or unbind to convert this to a plain chat.
        </div>
      )}
      <ChatPanel
        title={displayName}
        titleAccessory={titleAccessory}
        headerActions={headerActions}
        messages={pipeline.visibleMessages}
        onSend={pipeline.handleSend}
        isStreaming={pipeline.requestStatus === "streaming"}
        streamingMessageId={pipeline.streamingMessageId}
        providers={pipeline.providers}
        selectedProvider={pipeline.selectedProvider}
        onProviderChange={(id) => useProviderStore.getState().selectProvider(id)}
        providerConnectionPhase={pipeline.connectionPhase}
        providerConnectionError={pipeline.connectionError}
        onProviderReconnect={(id) => void useProviderStore.getState().reconnectProvider(id)}
        onProviderStartServer={(id) => void useProviderStore.getState().startProviderServer(id)}
        models={pipeline.models}
        selectedModel={pipeline.selectedModel}
        onModelChange={useProviderStore.getState().setSelectedModel}
        favoriteModels={pipeline.favoriteModels}
        onToggleFavorite={(id) => useSettingsStore.getState().toggleFavoriteModel(id)}
        supportsImages={pipeline.supportsImages}
        defaultMemoryEnabled={useSettingsStore.getState().defaultMemoryEnabled}
        onTriggerMemoryExtraction={pipeline.handleTriggerMemoryExtraction}
        sidebarsCollapsed={pipeline.sidebarsCollapsed}
        modelLoadProgress={pipeline.modelLoadProgress}
        mode="characters"
        onModeChange={handleModeChange}
        presentationMode={activeConversation?.presentationMode ?? "standard"}
        onPresentationModeChange={(presentationMode) => activeConversation && useChatStore.getState().setConversationPresentation(activeConversation.id, presentationMode)}
        onEditMessage={pipeline.handleEditMessage}
        onRegenerate={pipeline.handleRegenerate}
        onRetry={pipeline.handleRetry}
        onCopyMessage={pipeline.handleCopyMessage}
        onForkMessage={pipeline.handleForkMessage}
        onDeleteMessage={pipeline.handleDeleteMessage}
        editingMessageId={pipeline.editingMessageId}
        editInitialValue={pipeline.editInitialValue}
        onEditCancel={pipeline.handleEditCancel}
        onEditSave={pipeline.handleEditSave}
      />
    </div>
  );
}
