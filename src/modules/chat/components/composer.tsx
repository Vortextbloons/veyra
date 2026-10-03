import { useEffect, useRef, useState } from "react";
import {
  Check,
  Eye,
  Globe,
  Loader2,
  Plus,
  ArrowUp,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type { ChatMode } from "@/modules/chat/chat-types";
import type { ConversationExperience } from "@/modules/chat/studio/studio-types";
import {
  fileToAttachment,
  formatFileSize,
  MAX_FILE_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENTS,
  type MessageAttachment,
} from "@/lib/message-attachments";
import { ModeSelector } from "@/modules/chat/components/mode-selector";
import { FileTypeIcon, FilePreviewModal } from "@/modules/chat/components/file-preview-modal";
import { ChatOptionsMenu } from "@/modules/chat/components/chat-options-menu";
import { SkillSelector } from "@/modules/extensions/components/skill-selector";
import { McpChatToggle } from "@/modules/extensions/components/mcp-chat-toggle";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useSettingsStore } from "@/stores/settings-store";

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
  experience?: ConversationExperience;
  studioToolAvailable?: boolean;
  selectorControls?: React.ReactNode;
  contextIndicator?: React.ReactNode;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (on: boolean) => void;
  webSearchDisabled?: boolean;
  webSearchDisabledReason?: string;
  codeExecutionEnabled?: boolean;
  onCodeExecutionChange?: (on: boolean) => void;
  codeExecutionDisabled?: boolean;
  codeExecutionDisabledReason?: string;
  suggestedPrompt?: string;
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
    options?: { memoryEnabled: boolean },
  ) => void;
  onStop?: () => void;
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
  experience = "standard",
  studioToolAvailable = true,
  selectorControls,
  contextIndicator,
  webSearchEnabled = false,
  onWebSearchChange,
  webSearchDisabled = false,
  webSearchDisabledReason,
  codeExecutionEnabled = false,
  onCodeExecutionChange,
  codeExecutionDisabled = false,
  codeExecutionDisabledReason,
  suggestedPrompt,
  onSend,
  onStop,
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
  const [optionsOpen, setOptionsOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const webSearchSpeedPreset = useSettingsStore((s) => s.webSearchSpeedPreset);

  useClickOutside(optionsRef, optionsOpen, () => setOptionsOpen(false));

  const isEditMode = Boolean(editMessageId);

  useEffect(() => {
    if (!busy || !onStop) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onStop();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onStop]);

  useEffect(() => {
    if (!suggestedPrompt || isEditMode) return;
    const timer = window.setTimeout(() => {
      setValue(suggestedPrompt);
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(suggestedPrompt.length, suggestedPrompt.length);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isEditMode, suggestedPrompt]);

  useEffect(() => {
    if (!disabled) textareaRef.current?.focus();
  }, [disabled]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [value]);

  useEffect(() => {
    if (editMessageId && editInitialValue != null) {
      const timer = window.setTimeout(() => {
        setValue(editInitialValue);
        textareaRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [editMessageId, editInitialValue]);

  useEffect(() => {
    const insert = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text?.trim();
      if (!text || isEditMode) return;
      setValue((current) => current.trim() ? `${current.trim()}\n\n${text}` : text);
      textareaRef.current?.focus();
    };
    window.addEventListener("veyra:insert-composer-text", insert);
    return () => window.removeEventListener("veyra:insert-composer-text", insert);
  }, [isEditMode]);

  const activeAttachments = attachments;
  const activeAttachError = attachError;
  const isInputBlocked = Boolean(disabled || busy);
  const isControlsBlocked = Boolean(controlsDisabled);
  const webSearchActive = webSearchEnabled && !webSearchDisabled;
  const webSearchToggleClass =
    webSearchSpeedPreset === "fast"
      ? "bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15 hover:text-cyan-200"
      : "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200";

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
    <div className={`group/composer relative rounded-[28px] border bg-[var(--color-panel)] p-3 transition-colors focus-within:ring-1 focus-within:ring-[var(--color-accent)]/25 ${
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
        {!isEditMode && experience === "studio" && !studioToolAvailable && (
          <p className="rounded-md border border-amber-400/20 bg-amber-400/[0.06] px-2.5 py-2 text-[11px] leading-relaxed text-amber-100/90">
            Studio is enabled for this chat, but the active provider or model cannot render visual responses. You can still chat normally.
          </p>
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
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isEditMode ? "Edit your message..." : mode === "agents" ? "Describe a task for the agent..." : "Ask anything..."}
          aria-label={isEditMode ? "Edit message" : "Message"}
          className={`block w-full resize-none rounded-md bg-transparent px-3 py-2 font-normal leading-relaxed text-white transition-[font-size] duration-200 ease-out placeholder:text-[var(--color-text-dim)] focus:outline-none disabled:opacity-50 ${composerTextClass}`}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex min-w-0 flex-wrap items-center gap-0.5">
            {!isEditMode && (
              <>
                <IconButton
                  aria-label="Attach file"
                  title="Attach file (images, code, CSV, PDF, and more)"
                  disabled={isInputBlocked}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Plus className="size-5" />
                </IconButton>
              </>
            )}
            {!isEditMode && selectorControls && (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-1">{selectorControls}</div>
              </>
            )}
            {!isEditMode && <SkillSelector />}
            {!isEditMode && <McpChatToggle />}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isEditMode && (
              <>
                <ModeSelector value={mode} onChange={onModeChange} disabled={isControlsBlocked} />
                {contextIndicator}
                {onWebSearchChange && (
                  <button
                    type="button"
                    aria-label={`Web search: ${webSearchActive ? "on" : "off"}`}
                    aria-pressed={webSearchActive}
                    title={
                      webSearchDisabled
                        ? webSearchDisabledReason ?? "Web search is unavailable"
                        : webSearchActive
                          ? `Web search: on${webSearchSpeedPreset === "fast" ? " (fast)" : ""}`
                          : "Web search: off"
                    }
                    disabled={isControlsBlocked || webSearchDisabled}
                    onClick={() => onWebSearchChange(!webSearchEnabled)}
                    className={`grid size-7 place-items-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-40 ${
                      webSearchActive
                        ? webSearchToggleClass
                        : "text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Globe className="size-3.5" />
                  </button>
                )}
                <div ref={optionsRef} className="relative">
                  <IconButton
                    aria-label="Chat options"
                    title="Chat settings"
                    disabled={isControlsBlocked}
                    onClick={() => setOptionsOpen((open) => !open)}
                  >
                    <SlidersHorizontal className="size-3.5" />
                  </IconButton>
                  <ChatOptionsMenu
                    open={optionsOpen}
                    onClose={() => setOptionsOpen(false)}
                    memory={memory}
                    onMemoryChange={onMemoryChange}
                    onTriggerMemoryExtraction={onTriggerMemoryExtraction}
                    reasoningEnabled={reasoningEnabled}
                    onReasoningEnabledChange={onReasoningEnabledChange}
                    enhancedMode={enhancedMode}
                    onEnhancedModeChange={onEnhancedModeChange}
                    webSearchEnabled={webSearchEnabled}
                    onWebSearchChange={onWebSearchChange}
                    webSearchDisabled={webSearchDisabled}
                    webSearchDisabledReason={webSearchDisabledReason}
                    codeExecutionEnabled={codeExecutionEnabled}
                    onCodeExecutionChange={onCodeExecutionChange}
                    codeExecutionDisabled={codeExecutionDisabled}
                    codeExecutionDisabledReason={codeExecutionDisabledReason}
                  />
                </div>
              </>
            )}
            <button
              aria-label={isEditMode ? "Save edit" : "Send"}
              disabled={!canSend}
              onClick={handleSend}
              className="group/send grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-text)] text-[var(--color-bg)] transition-all hover:brightness-90 active:scale-95 disabled:opacity-30 disabled:hover:brightness-100 disabled:active:scale-100"
            >
              {busy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : isEditMode ? (
                <Check className="size-4" />
              ) : (
                <ArrowUp className="size-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
