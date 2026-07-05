import { useCallback, useEffect, useMemo, useState } from "react";
import { useCharacterGroupStore } from "../character-group-store";
import { useCharacterStore } from "../character-store";
import { newId, nowIso } from "@/lib/id";
import type { CharacterGroupSpeakerMode } from "../character-group-types";
import { GroupChatView } from "./GroupChatView";
import { startGroupChat } from "../group-chat";
import { ConfirmDangerModal } from "@/components/confirm-danger-modal";
import { GroupListPanel } from "./group/GroupListPanel";
import { GroupDetailView } from "./group/GroupDetailView";
import { GroupEditorDrawer } from "./group/GroupEditorDrawer";

export function GroupPage() {
  const hydrateGroups = useCharacterGroupStore((s) => s.hydrateGroups);
  const createGroup = useCharacterGroupStore((s) => s.createGroup);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void hydrateGroups();
  }, [hydrateGroups]);

  const handleCreate = useCallback(async () => {
    const now = nowIso();
    const id = newId("group");
    await createGroup({
      id,
      name: "New group",
      memberIds: [],
      speakerMode: "auto" as CharacterGroupSpeakerMode,
      isGlobal: true,
      createdAt: now,
      updatedAt: now,
    });
  }, [createGroup]);

  return (
    <>
      <GroupPageContent
        onCreate={handleCreate}
        onDeleteGroup={(id) => setConfirmDeleteId(id)}
      />
      <ConfirmDangerModal
        open={confirmDeleteId != null}
        title="Delete group?"
        description="This will permanently remove the group. Any conversations bound to it will keep their chat history but lose the persona/lorebook injection."
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await useCharacterGroupStore.getState().deleteGroup(id);
        }}
      />
    </>
  );
}

export function GroupPageContent({
  onCreate,
  onDeleteGroup,
}: {
  onCreate: () => void;
  onDeleteGroup: (id: string) => void;
}) {
  const groups = useCharacterGroupStore((s) => s.groups);
  const hydrationState = useCharacterGroupStore((s) => s.hydrationState);
  const activeGroupId = useCharacterGroupStore((s) => s.activeGroupId);
  const characters = useCharacterStore((s) => s.characters);
  const [chatOpenRaw, setChatOpen] = useState(false);

  const activeGroup = useMemo(
    () => (activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null),
    [activeGroupId, groups],
  );
  const chatOpen = chatOpenRaw && !!activeGroup;

  const [editorOpen, setEditorOpen] = useState(false);
  const [lastGroupId, setLastGroupId] = useState<string | null>(activeGroup?.id ?? null);
  if (lastGroupId !== (activeGroup?.id ?? null)) {
    setLastGroupId(activeGroup?.id ?? null);
    setEditorOpen(false);
  }

  const handleStartChat = useCallback(() => {
    if (!activeGroup) return;
    startGroupChat(activeGroup);
    setChatOpen(true);
  }, [activeGroup]);
  const handleBackFromChat = useCallback(() => setChatOpen(false), []);

  return (
    <div className="flex h-full min-w-0 flex-1 basis-0 flex-col bg-[var(--color-bg)]">
      <div className="flex flex-1 min-h-0">
        <GroupListPanel onCreate={onCreate} onDelete={onDeleteGroup} />
        {hydrationState === "ready" ? (
          chatOpen && activeGroup ? (
            <GroupChatView group={activeGroup} onBack={handleBackFromChat} />
          ) : (
            <GroupDetailView
              group={activeGroup}
              characters={characters}
              onStartChat={handleStartChat}
              onEdit={() => setEditorOpen(true)}
            />
          )
        ) : (
          <div className="flex flex-1 items-center justify-center text-[12px] text-[var(--color-text-dim)]">
            Loading groups…
          </div>
        )}
      </div>

      {editorOpen && activeGroup && (
        <GroupEditorDrawer group={activeGroup} onClose={() => setEditorOpen(false)} />
      )}
    </div>
  );
}

export default GroupPage;
