import { ProjectPicker } from "@/modules/projects/components/project-picker";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Eye,
  Loader2,
  Plus,
  ArrowUp,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  fileToAttachment,
  formatFileSize,
  MAX_FILE_ATTACHMENTS,
  MAX_IMAGE_ATTACHMENTS,
  type MessageAttachment,
} from "@/lib/message-attachments";
import { FileTypeIcon, FilePreviewModal } from "@/modules/chat/components/file-preview-modal";
import { ChatOptionsMenu } from "@/modules/chat/components/chat-options-menu";
import { ReasoningSlider } from "@/modules/chat/components/reasoning-slider";
import { useModelReasoning } from "@/hooks/use-model-reasoning";
import {
  effectiveReasoningLevel,
  type ReasoningLevel,
} from "@/lib/reasoning-capabilities";
import { useExtensionsStore } from "@/modules/extensions/extensions-store";
import { useSkillsStore } from "@/modules/extensions/skills-store";
import { SkillChipRow } from "@/modules/extensions/components/skill-chip";
import type { SkillRecord } from "@/modules/extensions/extension-types";
import { useAgentStore } from "@/modules/agents/agent-store";
import { useProjectStore } from "@/modules/projects/project-store";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useSettingsStore } from "@/stores/settings-store";
import { useChatStore } from "@/stores/chat-store";
import { invoke } from "@tauri-apps/api/core";

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
  selectorControls?: React.ReactNode;
  contextIndicator?: React.ReactNode;
  webSearchEnabled?: boolean;
  onWebSearchChange?: (on: boolean) => void;
  webSearchDisabled?: boolean;
  webSearchDisabledReason?: string;
  suggestedPrompt?: string;
  onSend?: (
    text: string,
    attachments?: MessageAttachment[],
  ) => void;
  onStop?: () => void;
  onSteer?: (text: string) => Promise<void>;
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
  selectorControls,
  contextIndicator,
  webSearchEnabled = false,
  onWebSearchChange,
  webSearchDisabled = false,
  webSearchDisabledReason,
  suggestedPrompt,
  onSend,
  onStop,
  onSteer,
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
  const [sendingSteer, setSendingSteer] = useState(false);
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [extractingFile, setExtractingFile] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<MessageAttachment | null>(null);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [skillMenuQuery, setSkillMenuQuery] = useState<string | null>(null);
  const [highlightedSkillIndex, setHighlightedSkillIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const defaultReasoningLevel = useSettingsStore((s) => s.reasoningLevel);
  const reasoningLevelByModel = useSettingsStore((s) => s.reasoningLevelByModel);
  const setModelReasoningLevel = useSettingsStore((s) => s.setModelReasoningLevel);
  const modelReasoning = useModelReasoning("pi");
  const reasoningLevels = modelReasoning.result?.levels ?? [];
  const preferredReasoningLevel = reasoningLevelByModel[modelReasoning.modelKey] ?? defaultReasoningLevel;
  const reasoningLevel = effectiveReasoningLevel(preferredReasoningLevel, reasoningLevels);
  const reasoningControl = modelReasoning.result?.control ?? "unknown";
  const piConversationId = useAgentStore((state) => state.activeSessionId);
  const conversationId = piConversationId ?? "new-chat";
  const projectId = useProjectStore((state) => state.activeProjectId) ?? undefined;
  const projects = useProjectStore((state) => state.projects);
  const activeSession = useAgentStore((state) => state.sessions.find((session) => session.id === state.activeSessionId));
  const policies = useExtensionsStore((state) => state.policies);
  const skillLibrary = useSkillsStore((state) => state.skills);
  const skillsEnabled = useSkillsStore((state) => state.skillsEnabled);
  const chatSkillIds = useSkillsStore((state) => state.chatSkillIds[conversationId]);
  const pendingSkillIds = useSkillsStore((state) => state.pendingTurnSkillIds[conversationId]);
  const addChatSkill = useSkillsStore((state) => state.addChatSkill);
  const removeChatSkill = useSkillsStore((state) => state.removeChatSkill);
  const setPendingTurnSkills = useSkillsStore((state) => state.setPendingTurnSkills);
  const projectPolicy = projectId ? policies[projectId] : undefined;
  const availableSkills = useMemo(() => skillsEnabled
    ? skillLibrary.filter((skill) => skill.enabled && (!projectId || !projectPolicy || projectPolicy.enabledSkillIds.length === 0 || projectPolicy.enabledSkillIds.includes(skill.id)))
    : [], [skillLibrary, skillsEnabled, projectId, projectPolicy]);
  const chatSkills = useMemo(() => (chatSkillIds ?? []).flatMap((id) => availableSkills.filter((skill) => skill.id === id)), [chatSkillIds, availableSkills]);
  const pendingSkills = useMemo(() => (pendingSkillIds ?? []).flatMap((id) => availableSkills.filter((skill) => skill.id === id)), [pendingSkillIds, availableSkills]);
  const selectedSkillIds = useMemo(() => [...chatSkills, ...pendingSkills].map((skill) => skill.id), [chatSkills, pendingSkills]);
  const matchingSkills = skillMenuQuery === null
    ? []
    : availableSkills.filter((skill) => skill.name.toLowerCase().includes(skillMenuQuery.toLowerCase()) || skill.slug.includes(skillMenuQuery.toLowerCase()));

  useClickOutside(optionsRef, optionsOpen, () => setOptionsOpen(false));

  const isEditMode = Boolean(editMessageId);

  /** Opens the picker when the caret sits inside a bare `/word` at line start. */
  const updateSkillMenu = (textarea: HTMLTextAreaElement) => {
    if (isEditMode) {
      setSkillMenuQuery(null);
      return;
    }
    const beforeCaret = textarea.value.slice(0, textarea.selectionStart);
    const match = beforeCaret.match(/^\/([^\s]*)$/);
    setSkillMenuQuery(match ? match[1] : null);
    setHighlightedSkillIndex(0);
  };

  /**
   * Adds a Skill to this message. Existing composer text is preserved because
   * only the `/query` token is removed, not the draft.
   */
  const selectSkill = (skill: SkillRecord) => {
    if (!selectedSkillIds.includes(skill.id)) {
      setPendingTurnSkills(conversationId, [...(pendingSkillIds ?? []), skill.id]);
    }
    setValue((current) => current.replace(/^\/[^\s]*/, "").trimStart());
    setSkillMenuQuery(null);
    setHighlightedSkillIndex(0);
    textareaRef.current?.focus();
  };

  const removePendingSkill = (skill: SkillRecord) => {
    setPendingTurnSkills(conversationId, (pendingSkillIds ?? []).filter((id) => id !== skill.id));
    textareaRef.current?.focus();
  };

  /** The explicit promotion from one request to the whole chat. */
  const pinSkill = (skill: SkillRecord) => {
    addChatSkill(conversationId, skill.id);
    textareaRef.current?.focus();
  };

  useEffect(() => {
    const attach = (event: Event) => {
      const { rootPath, relativePath, name } = (event as CustomEvent<{ rootPath: string; relativePath: string; name: string }>).detail;
      void (async () => {
        try {
          if (attachments.length >= MAX_FILE_ATTACHMENTS) throw new Error(`You can attach up to ${MAX_FILE_ATTACHMENTS} files total.`);
          setExtractingFile(name);
          const bytes = await invoke<number[]>("read_project_resource", { rootPath, relativePath });
          const ext = name.split(".").pop()?.toLowerCase();
          const imageTypes: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
          const attachment = await fileToAttachment(new File([new Uint8Array(bytes)], name, { type: imageTypes[ext ?? ""] ?? "" }));
          if (attachment.fileType === "image" && attachments.filter((item) => item.fileType === "image").length >= MAX_IMAGE_ATTACHMENTS) throw new Error(`You can attach up to ${MAX_IMAGE_ATTACHMENTS} images.`);
          setAttachments((current) => {
            if (current.length >= MAX_FILE_ATTACHMENTS || (attachment.fileType === "image" && current.filter((item) => item.fileType === "image").length >= MAX_IMAGE_ATTACHMENTS)) return current;
            return [...current, attachment];
          });
          setAttachError(null);
        } catch (cause) { setAttachError(`${name}: ${String(cause)}`); }
        finally { setExtractingFile(null); }
      })();
    };
    window.addEventListener("veyra:attach-project-file", attach);
    return () => window.removeEventListener("veyra:attach-project-file", attach);
  }, [attachments]);

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
    const result = modelReasoning.result;
    if (!result?.known || !modelReasoning.modelKey) return;
    // Nothing to normalize when the endpoint is managed or the lookup failed;
    // keep the stored preference so it applies again when levels are readable.
    if (result.levels.length === 0) return;
    if (preferredReasoningLevel !== reasoningLevel) {
      setModelReasoningLevel(modelReasoning.modelKey, reasoningLevel);
    }
  }, [modelReasoning.result, modelReasoning.modelKey, preferredReasoningLevel, reasoningLevel, setModelReasoningLevel]);

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
  const isInputBlocked = Boolean(disabled || (busy && !onSteer) || sendingSteer);
  const isControlsBlocked = Boolean(controlsDisabled);
  // The accent glow is an invitation for the first message only.
  const awaitingFirstMessage = !activeSession || activeSession.events.length === 0;

  const canSend =
    (value.trim().length > 0 || activeAttachments.length > 0) && !isInputBlocked && !extractingFile;

  const handleSend = () => {
    const text = value.trim();
    if ((!text && activeAttachments.length === 0) || isInputBlocked || extractingFile) return;
    if (busy && onSteer) {
      if (activeAttachments.length) { setAttachError("Send steering as text. Attach files after this response finishes."); return; }
      setSendingSteer(true);
      void onSteer(text).then(() => { setValue(""); setAttachError(null); })
        .catch((error: unknown) => setAttachError(String(error)))
        .finally(() => setSendingSteer(false));
      return;
    }
    if (isEditMode && editMessageId && onEditSave) {
      onEditSave(editMessageId, text);
      setValue("");
      setAttachments([]);
      setAttachError(null);
      textareaRef.current?.focus();
      return;
    }
    if (!text && activeAttachments.length === 0) return;

    const hasImageAttachments = activeAttachments.some((a) => a.fileType === "image");
    if (hasImageAttachments && !supportsImages) {
      setAttachError("Images require a vision model. Select a vision model or remove images.");
      return;
    }

    onSend?.(
      text,
      activeAttachments.length > 0 ? activeAttachments : undefined,
    );
    // The one-request Skills are cleared by the store once the request is
    // recorded; clearing here keeps the chips from flashing as still applied.
    setValue("");
    setAttachments([]);
    setAttachError(null);
    setSkillMenuQuery(null);
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
    if (!isEditMode && skillMenuQuery !== null) {
      if (matchingSkills.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        const direction = e.key === "ArrowDown" ? 1 : -1;
        setHighlightedSkillIndex((index) => (index + direction + matchingSkills.length) % matchingSkills.length);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const selected = matchingSkills[highlightedSkillIndex] ?? matchingSkills[0];
        if (selected) selectSkill(selected);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSkillMenuQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={`group/composer relative rounded-[28px] border bg-[var(--color-panel)] p-3 transition-[color,box-shadow] focus-within:ring-1 focus-within:ring-[var(--color-accent)]/25 ${
      awaitingFirstMessage ? "focus-within:shadow-[0_0_26px_-10px_var(--color-accent)]" : ""
    } ${
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
        {!isEditMode && <div className="flex items-center gap-2 px-2 text-xs text-[var(--color-text-dim)]">
          <ProjectPicker value={projectId} projects={projects} disabled={busy} onChange={(next) => {
            const agent = useAgentStore.getState();
            const session = agent.sessions.find((item) => item.id === agent.activeSessionId);
            if (session) {
              useAgentStore.setState({ sessions: agent.sessions.map((item) => item.id === session.id ? { ...item, projectId: next } : item) });
              useChatStore.getState().moveConversation(session.sourceConversationId ?? session.id, next);
            } else {
              const folder = useProjectStore.getState().projects.find((project) => project.id === next)?.settings.resources?.find((resource) => resource.directory)?.path ?? "";
              agent.setProjectPath(folder);
              agent.newSession();
            }
            useProjectStore.getState().setActiveProjectId(next ?? null);
          }} />
          {activeSession?.status === "running" && <span>Available after this response</span>}
        </div>}
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
        {!isEditMode && (
          <SkillChipRow
            chatSkills={chatSkills}
            pendingSkills={pendingSkills}
            disabled={isInputBlocked}
            onRemoveChatSkill={(skill) => { removeChatSkill(conversationId, skill.id); textareaRef.current?.focus(); }}
            onRemovePendingSkill={removePendingSkill}
            onPinPendingSkill={pinSkill}
          />
        )}
        <div className="relative">
          {!isEditMode && skillMenuQuery !== null && (
            <div id="skill-picker-listbox" role="listbox" aria-label="Skills" className="absolute bottom-full left-3 z-50 mb-2 max-h-72 w-[min(26rem,calc(100%-1.5rem))] overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-1.5 shadow-xl shadow-black/40">
              <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--color-text-dim)]">Use a Skill for this message</p>
              {matchingSkills.length === 0 ? (
                <p className="px-2 py-3 text-[11px] text-[var(--color-text-dim)]">
                  {availableSkills.length === 0
                    ? "No Skills yet. Create one in Settings → Skills."
                    : "No matching Skills."}
                </p>
              ) : matchingSkills.map((skill, index) => (
                <button
                  key={skill.id}
                  type="button"
                  role="option"
                  aria-selected={index === highlightedSkillIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setHighlightedSkillIndex(index)}
                  onClick={() => selectSkill(skill)}
                  className={`w-full rounded-lg px-2 py-2 text-left ${index === highlightedSkillIndex ? "bg-accent-tint" : "hover:bg-white/5"}`}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-[11.5px] font-medium text-white">{skill.name}</span>
                    {selectedSkillIds.includes(skill.id) && <Check className="size-3 shrink-0 text-emerald-400" aria-label="Already applied" />}
                  </span>
                  <span className="line-clamp-2 text-[10px] leading-snug text-[var(--color-text-dim)]">{skill.description || "Applies this Skill to one message"}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => { setValue(e.target.value); updateSkillMenu(e.currentTarget); }}
            onKeyDown={handleKeyDown}
            onKeyUp={(e) => updateSkillMenu(e.currentTarget)}
            onClick={(e) => updateSkillMenu(e.currentTarget)}
            placeholder={busy && onSteer ? "Guide the current response..." : isEditMode ? "Edit your message..." : availableSkills.length > 0 ? "Ask anything... (type / for Skills)" : "Ask anything..."}
            aria-label={isEditMode ? "Edit message" : "Message"}
            aria-autocomplete="list"
            aria-controls={skillMenuQuery !== null ? "skill-picker-listbox" : undefined}
            className={`block w-full resize-none rounded-md bg-transparent px-3 py-2 font-normal leading-relaxed text-white transition-[font-size] duration-200 ease-out placeholder:text-[var(--color-text-dim)] focus:outline-none disabled:opacity-50 ${composerTextClass}`}
          />
        </div>
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
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isEditMode && (
              <>
                <ReasoningSlider
                  levels={reasoningLevels}
                  value={reasoningLevel}
                  control={reasoningControl}
                  known={modelReasoning.result?.known ?? false}
                  message={modelReasoning.result?.message ?? (modelReasoning.checking ? "Checking reasoning options…" : "Select a model to configure reasoning")}
                  checking={modelReasoning.checking}
                  disabled={isControlsBlocked || !modelReasoning.result}
                  onChange={(level: ReasoningLevel) =>
                    setModelReasoningLevel(modelReasoning.modelKey, effectiveReasoningLevel(level, reasoningLevels))
                  }
                  onRefresh={modelReasoning.refresh}
                />
                {contextIndicator}
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
                    webSearchEnabled={webSearchEnabled}
                    onWebSearchChange={onWebSearchChange}
                    webSearchDisabled={webSearchDisabled}
                    webSearchDisabledReason={webSearchDisabledReason}
                  />
                </div>
              </>
            )}
            <button
              aria-label={busy && onSteer ? "Steer response" : isEditMode ? "Save edit" : "Send"}
              disabled={!canSend}
              onClick={handleSend}
              className="group/send grid size-9 shrink-0 place-items-center rounded-full bg-[var(--color-text)] text-[var(--color-bg)] transition-all hover:brightness-90 active:scale-95 disabled:opacity-30 disabled:hover:brightness-100 disabled:active:scale-100"
            >
              {busy && !onSteer || sendingSteer ? (
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
