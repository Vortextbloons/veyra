import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Users,
  RefreshCw,
  Trash2,
  ChevronDown,
  UserCheck,
} from "lucide-react";
import { ChatPanel } from "@/app/components/chat-panel";
import { useCharacterStore } from "../character-store";
import { useCharacterGroupStore } from "../character-group-store";
import { useCharacterChatPipeline } from "@/lib/use-character-chat-pipeline";
import {
  regenerateGroupGreeting,
  setGroupActiveSpeaker,
} from "../group-chat";
import { useChatStore } from "@/stores/chat-store";
import { useProviderStore } from "@/stores/provider-store";
import { useSettingsStore } from "@/stores/settings-store";
import { CharacterAvatar } from "../CharacterAvatar";
import { getAvatarGradient } from "../character-gradients";
import type { CharacterGroupRecord } from "../character-group-types";
import type { CharacterRecord } from "../character-types";
import { useWorkspaceModeChange } from "@/lib/workspace-mode";

interface GroupChatViewProps {
  group: CharacterGroupRecord;
  onBack: () => void;
}

export function GroupChatView({ group, onBack }: GroupChatViewProps) {
  const activeConversation = useChatStore((s) =>
    s.conversations.find((c) => c.id === s.activeConversationId) ?? null,
  );
  const characters = useCharacterStore((s) => s.characters);
  const groups = useCharacterGroupStore((s) => s.groups);
  const unbindCharacter = useChatStore((s) => s.unbindCharacter);
  const pipeline = useCharacterChatPipeline();
  const handleModeChange = useWorkspaceModeChange();
  const [speakerMenuOpen, setSpeakerMenuOpen] = useState(false);

  // The live group record (so header reflects in-memory edits).
  const liveGroup = groups.find((g) => g.id === group.id) ?? group;
  const isGroupChatActive = !!activeConversation && activeConversation.groupId === group.id;

  const members = useMemo<CharacterRecord[]>(() => {
    return liveGroup.memberIds
      .map((id) => characters.find((c) => c.id === id))
      .filter((c): c is CharacterRecord => Boolean(c));
  }, [liveGroup.memberIds, characters]);

  // Active speaker mirrors conversation.characterId (the pipeline already
  // manages it as the active speaker in the group context).
  const activeSpeakerId = activeConversation?.characterId;
  const activeSpeaker = members.find((m) => m.id === activeSpeakerId) ?? members[0];

  const isGroupDeleted = members.length === 0;
  const displayTitle = liveGroup.name || "Group";
  const openingSubtitle = liveGroup.scenario || `${members.length} members`;

  const onRegenerate = () => {
    if (!activeConversation) return;
    regenerateGroupGreeting(activeConversation.id, liveGroup, activeSpeaker?.id);
  };

  const onConvertToPlain = () => {
    if (!activeConversation) return;
    unbindCharacter(activeConversation.id);
    onBack();
  };

  const onSelectSpeaker = (id: string) => {
    if (!activeConversation) return;
    setGroupActiveSpeaker(activeConversation.id, id);
    setSpeakerMenuOpen(false);
  };

  const headerAccessory = (
    <div className="flex items-center gap-2">
      <ActiveSpeakerAvatar speaker={activeSpeaker} />
      <button
        type="button"
        onClick={() => setSpeakerMenuOpen((v) => !v)}
        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        aria-haspopup="menu"
        aria-expanded={speakerMenuOpen}
        title="Switch active speaker"
      >
        <span className="hidden md:inline">{activeSpeaker?.name ?? "Speaker"}</span>
        <ChevronDown className="size-3" />
      </button>
      {speakerMenuOpen && (
        <SpeakerMenu
          members={members}
          currentId={activeSpeaker?.id ?? null}
          onSelect={onSelectSpeaker}
          onClose={() => setSpeakerMenuOpen(false)}
        />
      )}
    </div>
  );

  const headerActions = (
    <>
      <button
        type="button"
        onClick={onRegenerate}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Regenerate greeting"
      >
        <RefreshCw className="size-3" />
        New greeting
      </button>
      <button
        type="button"
        onClick={onConvertToPlain}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Unbind from group"
      >
        <Trash2 className="size-3" />
        Unbind
      </button>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        title="Back to group"
      >
        <ArrowLeft className="size-3" />
        Back
      </button>
    </>
  );

  if (!isGroupChatActive) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center bg-[var(--color-bg)]">
        <div className="flex max-w-md flex-col items-center gap-3 text-center text-[12.5px] text-[var(--color-text-dim)]">
          <Users className="size-7 text-[var(--color-text-dim)]/40" />
          <p>Start a group chat from the header to begin a conversation with this roster.</p>
          {isGroupDeleted && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-amber-200">
              This group has no characters. Add at least one member to chat.
            </p>
          )}
        </div>
      </section>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]/60 px-4 py-2">
        <RosterStrip members={members} activeId={activeSpeaker?.id ?? null} />
        <div className="text-[10.5px] text-[var(--color-text-dim)]">
          {members.length} members · {openingSubtitle}
        </div>
      </div>
      {isGroupDeleted && (
        <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-[12px] text-amber-200">
          This group has no members. Edit the roster or unbind the conversation to
          continue.
        </div>
      )}
      <ChatPanel
        title={displayTitle}
        titleAccessory={headerAccessory}
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

function ActiveSpeakerAvatar({ speaker }: { speaker: CharacterRecord | undefined }) {
  if (!speaker) {
    return (
      <div
        className="grid size-6 shrink-0 place-items-center rounded-full border border-dashed border-[var(--color-border)] text-[10.5px] text-[var(--color-text-dim)]"
        title="No active speaker"
      >
        ?
      </div>
    );
  }
  return (
    <div className="relative shrink-0">
      <CharacterAvatar character={speaker} size="sm" className="rounded-full" />
      <div
        className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-[var(--color-bg)]"
        title={`Active speaker: ${speaker.name}`}
      >
        <UserCheck className="size-2" />
      </div>
    </div>
  );
}

function SpeakerMenu({
  members,
  currentId,
  onSelect,
  onClose,
}: {
  members: CharacterRecord[];
  currentId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div
        className="absolute right-0 top-full z-40 mt-1.5 w-64 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/50 px-3 py-2 text-[10.5px] uppercase tracking-wide text-[var(--color-text-dim)]">
          Active speaker
        </div>
        <div className="max-h-64 overflow-y-auto p-1">
          {members.length === 0 && (
            <div className="p-3 text-center text-[11.5px] text-[var(--color-text-dim)]">
              No members.
            </div>
          )}
          {members.map((m) => {
            const isCurrent = m.id === currentId;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelect(m.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors ${
                  isCurrent
                    ? "bg-[var(--color-accent-soft)] text-white"
                    : "text-white/85 hover:bg-white/[0.04]"
                }`}
              >
                <div
                  className={`size-6 shrink-0 rounded-full ${getAvatarGradient(m.avatarColor)}`}
                />
                <div className="min-w-0 flex-1 truncate">
                  <div className="font-medium">{m.name}</div>
                  {m.title && (
                    <div className="truncate text-[10.5px] text-[var(--color-text-dim)]">
                      {m.title}
                    </div>
                  )}
                </div>
                {isCurrent && <UserCheck className="size-3 text-emerald-400" />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function RosterStrip({
  members,
  activeId,
}: {
  members: CharacterRecord[];
  activeId: string | null;
}) {
  if (members.length === 0) return null;
  const visible = members.slice(0, 6);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center -space-x-1.5">
      {visible.map((m) => {
        const isActive = m.id === activeId;
        return (
          <div
            key={m.id}
            className={`relative rounded-full ring-2 ring-[var(--color-bg)] ${
              isActive ? "ring-emerald-400/70" : ""
            }`}
            title={`${m.name}${isActive ? " (active speaker)" : ""}`}
          >
            <CharacterAvatar character={m} size="sm" className="rounded-full" />
          </div>
        );
      })}
      {overflow > 0 && (
        <div className="grid size-6 shrink-0 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] text-[10px] text-[var(--color-text-dim)] ring-2 ring-[var(--color-bg)]">
          +{overflow}
        </div>
      )}
    </div>
  );
}
