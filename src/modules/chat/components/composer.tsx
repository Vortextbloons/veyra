import { useEffect, useRef, useState } from "react";
import {
  AtSign,
  Brain,
  Check,
  Eye,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import type { ChatMode } from "@/modules/chat/chat-types";
import {
  fileToAttachment,
  formatFileSize,
  MAX_FILE_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENTS,
  type MessageAttachment,
} from "@/lib/message-attachments";
import { ModeSelector } from "@/modules/chat/components/mode-selector";
import { FileTypeIcon, FilePreviewModal } from "@/modules/chat/components/file-preview-modal";

type FileAttachmentPreviewProps = {
  attachment: MessageAttachment;
  onRemove?: (id: string) => void;
  onPreview?: (attachment: MessageAttachment) => void;
};

function FileAttachmentPreviewCard({
  attachment,
  onRemove,
  onPreview,
}: FileAttachmentPreviewProps) {
  return (
    <div className="group/att relative flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 pr-6 text-[var(--color-text-dim)]">
      <FileTypeIcon name={attachment.name} className="size-4 shrink-0 text-[var(--color-accent)]" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] font-medium text-white/90">{attachment.name}</p>
        <p className="text-[10px] text-[var(--color-text-dim)]/70">
          {formatFileSize(attachment.size)}
          {attachment.textContent && ` · ${attachment.textContent.length.toLocaleString()} chars`}
          {attachment.truncated && (
            <span className="ml-1 text-amber-400/80">(truncated)</span>
          )}
        </p>
      </div>
      {onPreview && attachment.textContent && (
        <button
          type="button"
          aria-label={`Preview ${attachment.name}`}
          onClick={() => onPreview(attachment)}
          className="absolute right-5 top-1/2 -translate-y-1/2 grid size-4 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-white group-hover/att:opacity-100"
        >
          <Eye className="size-3" />
        </button>
      )}
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${attachment.name}`}
          onClick={() => onRemove(attachment.id)}
          className="absolute right-1 top-1/2 -translate-y-1/2 grid size-4 place-items-center rounded text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-white group-hover/att:opacity-100"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

export type MessageAttachmentsPreviewProps = {
  attachments: MessageAttachment[];
  onRemove?: (id: string) => void;
  onPreview?: (attachment: MessageAttachment) => void;
};

export function MessageAttachmentsPreview({
  attachments,
  onRemove,
  onPreview,
}: MessageAttachmentsPreviewProps) {
  const images = attachments.filter((a) => a.fileType === "image");
  const files = attachments.filter((a) => a.fileType !== "image");

  return (
    <div className={`flex flex-col gap-2 ${onRemove ? "mb-2" : "mb-2 last:mb-0"}`}>
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((attachment) => (
            <div key={attachment.id} className="group/att relative">
              <img
                src={attachment.dataUrl}
                alt={attachment.name}
                className="max-h-40 max-w-full rounded-lg border border-white/10 object-cover"
              />
              {onRemove && (
                <button
                  type="button"
                  aria-label={`Remove ${attachment.name}`}
                  onClick={() => onRemove(attachment.id)}
                  className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-[var(--color-border)] bg-[var(--color-panel)] text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-white group-hover/att:opacity-100"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {files.map((attachment) => (
            <FileAttachmentPreviewCard
              key={attachment.id}
              attachment={attachment}
              onRemove={onRemove}
              onPreview={onPreview}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function IconButton({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`grid size-7 place-items-center rounded-md text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:pointer-events-none ${className ?? ""}`}
    >
      {children}
    </button>
  );
}

function ToggleIconButton({
  icon: Icon,
  label,
  active,
  accent,
  onChange,
  onLongPress,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  accent: "emerald" | "violet" | "amber";
  onChange: (on: boolean) => void;
  onLongPress?: () => void;
  disabled?: boolean;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPressRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const handlePointerDown = () => {
    if (disabled || !onLongPress) return;
    didLongPressRef.current = false;
    timerRef.current = setTimeout(() => {
      didLongPressRef.current = true;
      onLongPress();
    }, 500);
  };

  const handlePointerUp = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleClick = () => {
    if (didLongPressRef.current) {
      didLongPressRef.current = false;
      return;
    }
    if (!disabled) onChange(!active);
  };

  const activeStyles = {
    emerald: "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25",
    violet: "bg-violet-500/15 text-violet-400 ring-1 ring-violet-500/25",
    amber: "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25",
  }[accent];

  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={`${label}${onLongPress ? " (hold to extract)" : ""}`}
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onClick={handleClick}
      title={`${label}${active ? " (on)" : " (off)"}${onLongPress ? " · hold to extract" : ""}`}
      className={`grid size-7 place-items-center rounded-md transition-all ${
        active
          ? activeStyles
          : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <Icon className="size-3.5" />
    </button>
  );
}

type ComposerProps = {
  memory: boolean;
  onMemoryChange: (on: boolean) => void;
  onTriggerMemoryExtraction?: () => void;
  reasoningEnabled: boolean;
  onReasoningEnabledChange: (on: boolean) => void;
  enhancedMode: boolean;
  onEnhancedModeChange: (on: boolean) => void;
  mode: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
    options?: { memoryEnabled: boolean },
  ) => void;
  disabled?: boolean;
  controlsDisabled?: boolean;
  busy?: boolean;
  supportsImages?: boolean;
  composerTextClass?: string;
  editMessageId?: string | null;
  editInitialValue?: string;
  onEditCancel?: () => void;
  onEditSave?: (messageId: string, newContent: string) => void;
};

export function Composer({
  memory,
  onMemoryChange,
  onTriggerMemoryExtraction,
  reasoningEnabled,
  onReasoningEnabledChange,
  enhancedMode,
  onEnhancedModeChange,
  mode,
  onModeChange,
  onSend,
  disabled,
  controlsDisabled = false,
  busy = false,
  supportsImages = false,
  composerTextClass = "text-[14px]",
  editMessageId = null,
  editInitialValue,
  onEditCancel,
  onEditSave,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [extractingFile, setExtractingFile] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = Boolean(editMessageId);

  useEffect(() => {
    if (editMessageId && editInitialValue != null) {
      const timer = window.setTimeout(() => {
        setValue(editInitialValue);
        textareaRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [editMessageId, editInitialValue]);

  const activeAttachments = attachments;
  const activeAttachError = attachError;
  const isInputBlocked = Boolean(disabled || busy);
  const isControlsBlocked = Boolean(controlsDisabled);

  const canSend =
    (value.trim().length > 0 || activeAttachments.length > 0) && !isInputBlocked;

  const handleSend = () => {
    const text = value.trim();
    if ((!text && activeAttachments.length === 0) || isInputBlocked) return;
    if (isEditMode && editMessageId && onEditSave) {
      onEditSave(editMessageId, text);
      setValue("");
      setAttachments([]);
      setAttachError(null);
      textareaRef.current?.focus();
      return;
    }

    const hasImageAttachments = activeAttachments.some((a) => a.fileType === "image");
    if (hasImageAttachments && !supportsImages) {
      setAttachError("Images require a vision model. Select a vision model or remove images.");
      return;
    }

    onSend?.(
      text,
      activeAttachments.length > 0 ? activeAttachments : undefined,
      { memoryEnabled: memory },
    );
    setValue("");
    setAttachments([]);
    setAttachError(null);
    textareaRef.current?.focus();
  };

  const handleFilesSelected = async (files: FileList | null) => {
    if (!files?.length) return;
    setAttachError(null);

    const currentImages = activeAttachments.filter((a) => a.fileType === "image").length;
    const remaining = MAX_FILE_ATTACHMENTS - activeAttachments.length;

    if (remaining <= 0) {
      setAttachError(`You can attach up to ${MAX_FILE_ATTACHMENTS} files total.`);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    const errors: string[] = [];
    let runningImageCount = currentImages;

    for (const file of selected) {
      try {
        const attachment = await fileToAttachment(file, {
          onExtracting: (name) => setExtractingFile(name),
        });
        if (attachment.fileType === "image") {
          if (runningImageCount >= MAX_IMAGE_ATTACHMENTS) {
            errors.push(
              `${file.name}: Max ${MAX_IMAGE_ATTACHMENTS} images allowed.`,
            );
            continue;
          }
          runningImageCount++;
        }
        setAttachments((current) => [...current, attachment]);
      } catch (err) {
        errors.push(
          `${file.name}: ${err instanceof Error ? err.message : "Failed to attach"}`,
        );
      }
    }

    setExtractingFile(null);
    if (errors.length > 0) {
      setAttachError(errors.join("\n"));
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`group/composer relative rounded-2xl border bg-[var(--color-panel)] p-2 transition-all focus-within:ring-1 focus-within:ring-[var(--color-accent)]/25 ${
      isEditMode
        ? "border-amber-400/40 focus-within:border-amber-400/60"
        : "border-[var(--color-border)] focus-within:border-[var(--color-accent)]/40"
    }`}>
      {previewAttachment && (
        <FilePreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
      <div className="flex flex-col gap-1.5">
        {isEditMode && (
          <div className="flex items-center justify-between px-2 pb-0.5">
            <span className="text-[11px] font-medium text-amber-300/80">Editing message</span>
            <button
              type="button"
              onClick={() => {
                onEditCancel?.();
                setValue("");
              }}
              className="text-[11px] text-[var(--color-text-dim)] hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => void handleFilesSelected(e.target.files)}
        />
        {activeAttachments.length > 0 && (
          <MessageAttachmentsPreview
            attachments={activeAttachments}
            onRemove={(id) =>
              setAttachments((current) => current.filter((item) => item.id !== id))
            }
            onPreview={(att) => setPreviewAttachment(att)}
          />
        )}
        {extractingFile && (
          <div className="flex items-center gap-2 px-2 text-[11.5px] text-[var(--color-text-dim)]">
            <Loader2 className="size-3 animate-spin" />
            Extracting {extractingFile}...
          </div>
        )}
        {activeAttachError && (
          <p className="whitespace-pre-wrap px-2 text-[11.5px] text-amber-300">{activeAttachError}</p>
        )}
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isEditMode ? "Edit your message..." : mode === "agents" ? "Describe a task for the agent..." : "Ask anything..."}
          disabled={isInputBlocked}
          className={`block w-full resize-none rounded-md bg-transparent px-2 py-1.5 font-medium leading-snug tracking-[-0.005em] text-white transition-[font-size] duration-200 ease-out placeholder:font-normal placeholder:tracking-normal placeholder:text-[var(--color-text-dim)]/70 focus:outline-none disabled:opacity-50 ${composerTextClass}`}
        />
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)]/50 pt-1.5">
          <div className="flex items-center gap-0.5">
            {!isEditMode && (
              <>
                <IconButton
                  aria-label="Attach file"
                  title="Attach file (images, code, CSV, PDF, and more)"
                  disabled={isInputBlocked}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="size-3.5" />
                </IconButton>
                <IconButton aria-label="Mention">
                  <AtSign className="size-3.5" />
                </IconButton>
              </>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isEditMode && (
              <>
                <ModeSelector value={mode} onChange={onModeChange} disabled={isControlsBlocked} />
                <ToggleIconButton
                  icon={Brain}
                  label="Memory"
                  active={memory}
                  accent="emerald"
                  onChange={onMemoryChange}
                  onLongPress={onTriggerMemoryExtraction}
                  disabled={isControlsBlocked}
                />
                <ToggleIconButton
                  icon={Sparkles}
                  label="Reasoning"
                  active={reasoningEnabled}
                  accent="violet"
                  onChange={onReasoningEnabledChange}
                  disabled={isControlsBlocked}
                />
                <ToggleIconButton
                  icon={Zap}
                  label="Enhanced"
                  active={enhancedMode}
                  accent="amber"
                  onChange={onEnhancedModeChange}
                  disabled={isControlsBlocked}
                />
              </>
            )}
            <button
              aria-label={isEditMode ? "Save edit" : "Send"}
              disabled={!canSend}
              onClick={handleSend}
              className="group/send grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)] text-white shadow-[0_0_0_1px_rgba(99,102,241,0.3)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:hover:brightness-100 disabled:active:scale-100"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isEditMode ? (
                <Check className="size-4" />
              ) : (
                <Send className="size-4 transition-transform group-hover/send:translate-x-0.5 group-hover/send:-translate-y-0.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
