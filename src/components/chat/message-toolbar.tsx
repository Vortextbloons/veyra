import {
  Copy,
  GitFork,
  Pencil,
  RefreshCw,
  RotateCcw,
  Trash2,
} from "lucide-react";

type MessageToolbarProps = {
  isUser: boolean;
  isStreaming: boolean;
  isLastAssistant: boolean;
  onEdit?: () => void;
  onRegenerate?: () => void;
  onRetry?: () => void;
  onCopy?: () => void;
  onFork?: () => void;
  onDelete?: () => void;
};

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.08] hover:text-white disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function MessageToolbar({
  isUser,
  isStreaming,
  isLastAssistant,
  onEdit,
  onRegenerate,
  onRetry,
  onCopy,
  onFork,
  onDelete,
}: MessageToolbarProps) {
  const handleDelete = () => {
    if (window.confirm("Delete this message? This cannot be undone.")) {
      onDelete?.();
    }
  };

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-0.5 shadow-lg shadow-black/30 opacity-0 transition-opacity group-hover/message:opacity-100 ${
        isUser ? "ml-auto" : ""
      }`}
    >
      {isUser && (
        <ToolbarButton label="Edit" onClick={onEdit} disabled={isStreaming}>
          <Pencil className="size-3.5" />
        </ToolbarButton>
      )}
      {!isUser && (
        <>
          <ToolbarButton
            label="Regenerate"
            onClick={onRegenerate}
            disabled={isStreaming || !isLastAssistant}
          >
            <RefreshCw className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton
            label="Retry"
            onClick={onRetry}
            disabled={isStreaming || !isLastAssistant}
          >
            <RotateCcw className="size-3.5" />
          </ToolbarButton>
        </>
      )}
      <ToolbarButton label="Copy" onClick={onCopy} disabled={isStreaming}>
        <Copy className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Fork" onClick={onFork} disabled={isStreaming}>
        <GitFork className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton label="Delete" onClick={handleDelete} disabled={isStreaming}>
        <Trash2 className="size-3.5" />
      </ToolbarButton>
    </div>
  );
}
