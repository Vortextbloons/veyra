import { Edit3, Pin, Archive, Check, X, Trash2, Sparkles } from "lucide-react";
import type { MemoryNode } from "@/lib/memory-types";
import { useMemoryStore } from "@/stores/memory-store";
import { useMemoryUi } from "./memory-ui-context";

type Props = {
  onEdit: (node: MemoryNode) => void;
};

export function MemoryDetail({ onEdit }: Props) {
  const { selectedNodeId, selectNode } = useMemoryUi();
  const nodes = useMemoryStore((s) => s.nodes);
  const pinNode = useMemoryStore((s) => s.pinNode);
  const archiveNode = useMemoryStore((s) => s.archiveNode);
  const deleteNode = useMemoryStore((s) => s.deleteNode);
  const approveNode = useMemoryStore((s) => s.approveNode);
  const rejectNode = useMemoryStore((s) => s.rejectNode);
  const folders = useMemoryStore((s) => s.folders);

  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) {
    return (
      <aside className="flex w-[320px] shrink-0 flex-col items-center justify-center border-l border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <Sparkles className="mb-2 size-4 text-[var(--color-text-dim)]" />
        <p className="text-[12.5px] text-[var(--color-text-dim)]">
          Select a memory to view details
        </p>
      </aside>
    );
  }

  const folder = folders.find((f) => f.id === node.folderId);

  return (
    <aside className="flex w-[340px] shrink-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2.5">
        <h2 className="truncate text-[12.5px] font-semibold tracking-tight">{node.title}</h2>
        <div className="flex items-center gap-0.5">
          <IconButton title="Edit" onClick={() => onEdit(node)}>
            <Edit3 className="size-3.5" />
          </IconButton>
          <IconButton
            title={node.isPinned ? "Unpin" : "Pin"}
            onClick={() => pinNode(node.id, !node.isPinned)}
            active={node.isPinned}
          >
            <Pin className="size-3.5" />
          </IconButton>
          <IconButton title="Archive" onClick={() => archiveNode(node.id)}>
            <Archive className="size-3.5" />
          </IconButton>
          <IconButton
            title="Delete"
            onClick={() => {
              if (window.confirm(`Delete "${node.title}"?`)) {
                void deleteNode(node.id);
                selectNode(null);
              }
            }}
            danger
          >
            <Trash2 className="size-3.5" />
          </IconButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 text-[12.5px] leading-relaxed">
        {node.summary && (
          <p className="mb-3 rounded-lg border border-[var(--color-border)] bg-white/[0.02] p-2.5 text-[var(--color-text)]">
            {node.summary}
          </p>
        )}

        <div className="whitespace-pre-wrap text-[12.5px] text-[var(--color-text)]">
          {node.content}
        </div>

        {node.status === "needs_review" && (
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => approveNode(node.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1.5 text-[12px] text-emerald-300 hover:bg-emerald-500/15"
            >
              <Check className="size-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => rejectNode(node.id)}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[12px] text-red-300 hover:bg-red-500/15"
            >
              <X className="size-3.5" />
              Reject
            </button>
          </div>
        )}

        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[11.5px]">
          <Meta label="Type" value={node.type} />
          <Meta label="Scope" value={node.scope} />
          <Meta label="Status" value={node.status} />
          <Meta label="Priority" value={node.priority} />
          <Meta label="Origin" value={node.origin} />
          <Meta label="Importance" value={`${node.importance}/5`} />
          <Meta label="Confidence" value={node.confidence.toFixed(2)} />
          <Meta label="Folder" value={folder?.name ?? node.folderId} />
          {node.tags.length > 0 && (
            <>
              <dt className="text-[var(--color-text-dim)]">Tags</dt>
              <dd className="text-white">{node.tags.join(", ")}</dd>
            </>
          )}
          <Meta label="Created" value={new Date(node.createdAt).toLocaleString()} />
          <Meta label="Updated" value={new Date(node.updatedAt).toLocaleString()} />
          <Meta label="Used" value={`${node.useCount}×`} />
          {node.lastUsedAt && <Meta label="Last used" value={new Date(node.lastUsedAt).toLocaleString()} />}
          {node.expiresAt && <Meta label="Expires" value={new Date(node.expiresAt).toLocaleString()} />}
          {node.sourceMessageIds.length > 0 && <Meta label="Sources" value={`${node.sourceMessageIds.length} messages`} />}
          {node.extractionBatchId && <Meta label="Batch" value={node.extractionBatchId.slice(0, 8)} />}
          {node.duplicateOf && <Meta label="Duplicate" value={node.duplicateOf.slice(0, 8)} />}
          {node.contradictionOf && <Meta label="Conflict" value={node.contradictionOf.slice(0, 8)} />}
        </dl>
      </div>
    </aside>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[var(--color-text-dim)]">{label}</dt>
      <dd className="font-mono text-white">{value}</dd>
    </>
  );
}

function IconButton({
  children,
  onClick,
  title,
  active,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`grid size-6 place-items-center rounded-md transition-colors ${
        active
          ? "bg-indigo-500/20 text-indigo-300"
          : danger
          ? "text-[var(--color-text-dim)] hover:bg-red-500/15 hover:text-red-300"
          : "text-[var(--color-text-dim)] hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}
