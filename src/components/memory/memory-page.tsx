import { useEffect, useState } from "react";
import { Plus, Database } from "lucide-react";
import { useMemoryStore } from "@/stores/memory-store";
import type { CreateMemoryNode, MemoryNode } from "@/lib/memory-types";
import { MemorySidebar } from "./memory-sidebar";
import { MemoryList } from "./memory-list";
import { MemoryDetail } from "./memory-detail";
import { MemoryEditor } from "./memory-editor";
import { MemoryUiProvider } from "./memory-ui-context";

export function MemoryPage() {
  const hydrate = useMemoryStore((s) => s.hydrateMemory);
  const isLoading = useMemoryStore((s) => s.isLoading);
  const nodes = useMemoryStore((s) => s.nodes);
  const folders = useMemoryStore((s) => s.folders);
  const createNode = useMemoryStore((s) => s.createNode);
  const [editing, setEditing] = useState<null | { mode: "create" | "edit"; initial?: Partial<CreateMemoryNode> & { id?: string } }>(null);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  const defaultFolderId = folders[0]?.id ?? "default";

  return (
    <MemoryUiProvider>
    <main className="flex h-full min-w-0 flex-1 flex-col bg-[var(--color-bg)]">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg)] px-5">
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-lg bg-gradient-to-br from-indigo-500/30 to-violet-500/20 ring-1 ring-inset ring-indigo-400/30">
            <Database className="size-3.5 text-indigo-300" />
          </div>
          <h1 className="text-[14px] font-semibold tracking-tight">Memory</h1>
          <span className="ml-2 rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10.5px] font-mono uppercase tracking-wide text-[var(--color-text-dim)]">
            {nodes.length} total
          </span>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ mode: "create" })}
          className="flex h-7 items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-2.5 text-[12px] font-medium text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4)] hover:brightness-110"
        >
          <Plus className="size-3.5" />
          New Memory
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        <MemorySidebar />
        {isLoading && nodes.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[12.5px] text-[var(--color-text-dim)]">
            Loading memory…
          </div>
        ) : (
          <>
            <MemoryList />
            <MemoryDetail onEdit={(node) => setEditing({ mode: "edit", initial: nodeToCreateInput(node, defaultFolderId) })} />
          </>
        )}
      </div>

      {editing && (
        <MemoryEditor
          mode={editing.mode}
          initial={editing.initial}
          onCancel={() => setEditing(null)}
          onSave={async (values) => {
            await createNode({
              ...values,
              folderId: values.folderId || defaultFolderId,
            });
            setEditing(null);
          }}
        />
      )}
    </main>
    </MemoryUiProvider>
  );
}

export default MemoryPage;

function nodeToCreateInput(
  node: MemoryNode,
  defaultFolderId: string,
): Partial<CreateMemoryNode> & { id?: string } {
  return {
    id: node.id,
    folderId: node.folderId || defaultFolderId,
    fileId: node.fileId,
    projectId: node.projectId,
    conversationId: node.conversationId,
    title: node.title,
    content: node.content,
    summary: node.summary,
    type: node.type,
    scope: node.scope,
    tags: node.tags,
    importance: node.importance,
    confidence: node.confidence,
    priority: node.priority,
    origin: node.origin,
    status: node.status,
    isPinned: node.isPinned,
  };
}
