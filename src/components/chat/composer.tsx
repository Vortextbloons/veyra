import { useRef, useState } from "react";
import {
  AtSign,
  Brain,
  ImageIcon,
  Loader2,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import type { ChatMode } from "@/lib/chat-types";
import {
  fileToAttachment,
  MAX_IMAGE_ATTACHMENTS,
  type MessageAttachment,
} from "@/lib/message-attachments";
import { Toggle } from "@/components/toggle";
import { ModeSelector } from "@/components/chat/mode-selector";

type MessageAttachmentsPreviewProps = {
  attachments: MessageAttachment[];
  onRemove?: (id: string) => void;
};

export function MessageAttachmentsPreview({
  attachments,
  onRemove,
}: MessageAttachmentsPreviewProps) {
  return (
    <div
      className={`flex flex-wrap gap-2 ${onRemove ? "mb-2" : "mb-2 last:mb-0"}`}
    >
      {attachments.map((attachment) => (
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

type ComposerProps = {
  memory: boolean;
  onMemoryChange: (on: boolean) => void;
  onTriggerMemoryExtraction?: () => void;
  showReasoning: boolean;
  onShowReasoningChange: (on: boolean) => void;
  mode: ChatMode;
  onModeChange?: (mode: ChatMode) => void;
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
    options?: { memoryEnabled: boolean },
  ) => void;
  disabled?: boolean;
  supportsImages?: boolean;
  composerTextClass?: string;
};

export function Composer({
  memory,
  onMemoryChange,
  onTriggerMemoryExtraction,
  showReasoning,
  onShowReasoningChange,
  mode,
  onModeChange,
  onSend,
  disabled,
  supportsImages = false,
  composerTextClass = "text-[14px]",
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeAttachments = supportsImages ? attachments : [];
  const activeAttachError = supportsImages ? attachError : null;

  const canSend =
    (value.trim().length > 0 || activeAttachments.length > 0) && !disabled;

  const handleSend = () => {
    const text = value.trim();
    if ((!text && activeAttachments.length === 0) || disabled) return;
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
    if (!files?.length || !supportsImages) return;
    setAttachError(null);

    const remaining = MAX_IMAGE_ATTACHMENTS - activeAttachments.length;
    if (remaining <= 0) {
      setAttachError(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`);
      return;
    }

    const selected = Array.from(files).slice(0, remaining);
    try {
      const next = await Promise.all(selected.map((file) => fileToAttachment(file)));
      setAttachments((current) => [...current, ...next]);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Failed to attach image.");
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
    <div className="group/composer relative rounded-2xl border border-[var(--color-border)] bg-gradient-to-b from-[var(--color-panel)] to-[var(--color-bg)] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-all focus-within:border-[var(--color-accent)]/40 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_0_0_3px_rgba(99,102,241,0.08)]">
      <div className="flex flex-col gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
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
          />
        )}
        {activeAttachError && (
          <p className="px-2 text-[11.5px] text-amber-300">{activeAttachError}</p>
        )}
        <textarea
          ref={textareaRef}
          rows={2}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={mode === "agents" ? "Describe a coding task…" : "Ask anything…"}
          disabled={disabled}
          className={`block w-full resize-none rounded-md bg-transparent px-2 py-1.5 font-medium leading-snug tracking-[-0.005em] text-white transition-[font-size] duration-200 ease-out placeholder:font-normal placeholder:tracking-normal placeholder:text-[var(--color-text-dim)]/70 focus:outline-none disabled:opacity-50 ${composerTextClass}`}
        />
        <div className="flex items-center justify-between gap-2 border-t border-[var(--color-border)]/50 pt-1.5">
          <div className="flex items-center gap-0.5">
            <IconButton
              aria-label={
                supportsImages
                  ? "Attach image"
                  : "Images not supported by the selected model"
              }
              title={
                supportsImages
                  ? "Attach image (JPEG, PNG, WebP)"
                  : "Select a vision model to attach images"
              }
              disabled={!supportsImages || disabled}
              onClick={() => fileInputRef.current?.click()}
              className={
                !supportsImages
                  ? "cursor-not-allowed opacity-40 hover:bg-transparent hover:text-[var(--color-text-dim)]"
                  : undefined
              }
            >
              {supportsImages ? (
                <ImageIcon className="size-3.5" />
              ) : (
                <Paperclip className="size-3.5" />
              )}
            </IconButton>
            <IconButton aria-label="Mention">
              <AtSign className="size-3.5" />
            </IconButton>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ModeSelector value={mode} onChange={onModeChange} />
            <Toggle label="Memory" on={memory} onChange={onMemoryChange} />
            <IconButton
              aria-label="Extract memories now"
              title="Extract memories now"
              disabled={disabled || !onTriggerMemoryExtraction}
              onClick={() => onTriggerMemoryExtraction?.()}
            >
              <Brain className="size-3.5" />
            </IconButton>
            <Toggle
              label="Reasoning"
              on={showReasoning}
              onChange={onShowReasoningChange}
            />
            <button
              aria-label="Send"
              disabled={!canSend}
              onClick={handleSend}
              className="group/send grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--color-accent)] text-white shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_12px_-2px_rgba(99,102,241,0.4)] transition-all hover:brightness-110 hover:shadow-[0_0_0_1px_rgba(99,102,241,0.5),0_6px_16px_-2px_rgba(99,102,241,0.5)] active:scale-95 disabled:opacity-40 disabled:hover:brightness-100 disabled:hover:shadow-[0_0_0_1px_rgba(99,102,241,0.4),0_4px_12px_-2px_rgba(99,102,241,0.4)] disabled:active:scale-100"
            >
              {disabled ? (
                <Loader2 className="size-4 animate-spin" />
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
