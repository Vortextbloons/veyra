import { useEffect, useState } from "react";
import type { CharacterRecord, CharacterAvatarColor } from "../../character-types";
import { CHARACTER_AVATAR_COLORS } from "../../character-types";
import { AVATAR_GRADIENTS } from "../../character-gradients";
import { WandButton, StreamingPreview, type WandAction } from "../../ai-assist/WandButton";
import { useAssistJob, useAssistRunner, useCancelOnUnmount } from "../../ai-assist/use-assist-job";
import type { CharacterPendingChange } from "../../ai-assist/ai-assist-types";
import { useCharacterAssistStore } from "../../ai-assist/ai-assist-store";
import { useSettingsStore } from "@/stores/settings-store";
import { FieldRow, PendingChangeApplier } from "./SharedUI";

export function IdentityTab({
  draft,
  setDraft,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}) {
  const tone = useSettingsStore((s) => s.characterAssistTone);
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);

  const fieldActions = (label: string, current: string, field: string): WandAction[] => {
    void current;
    void field;
    return [
    {
      id: "rewrite",
      label: "Rewrite",
      description: `Rephrase ${label.toLowerCase()} while preserving meaning.`,
      instruction: `Rewrite the ${label.toLowerCase()} of this character card. Preserve meaning.`,
    },
    {
      id: "expand",
      label: "Expand",
      description: `Add useful detail to ${label.toLowerCase()}.`,
      instruction: `Expand the ${label.toLowerCase()} with more detail in a ${tone} tone.`,
    },
    {
      id: "condense",
      label: "Condense",
      description: `Make ${label.toLowerCase()} more concise.`,
      instruction: `Make the ${label.toLowerCase()} more concise.`,
    },
  ];
  };

  const handleRun = (field: string, current: string, action: WandAction) => {
    const actionId = action.id as "rewrite" | "expand" | "condense";
    const jobId = runner.start(
      {
        action: actionId,
        characterId: draft.id,
        targetField: field,
        currentValue: current,
        options: { tone: tone as never },
      },
      { character: draft },
    );
    void jobId;
  };

  if (job.result && job.result.card) {
    const card = job.result.card;
    const key = Object.keys(card)[0];
    if (key) {
      const value = (card as Record<string, unknown>)[key];
      if (typeof value === "string") {
        const change: Omit<CharacterPendingChange, "id" | "createdAt" | "status"> = {
          characterId: draft.id,
          field: key,
          label: key,
          before: (draft as unknown as Record<string, unknown>)[key],
          after: value,
          source: "rewrite",
        };
        addPendingChange(change);
      }
    }
    job.clear();
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Name" required>
          <input
            type="text"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FieldRow>
        <FieldRow label="Title">
          <input
            type="text"
            value={draft.title ?? ""}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
        </FieldRow>
      </div>
      <FieldRow label="Tagline" hint="One-line summary shown in the list.">
        <div className="flex items-start gap-2">
          <input
            type="text"
            value={draft.tagline}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value })}
            className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
          />
          <WandButton
            actions={fieldActions("Tagline", draft.tagline, "tagline")}
            onAction={(a) => handleRun("tagline", draft.tagline, a)}
            busy={job.running}
          />
        </div>
        <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint="Rewriting tagline…" />
        <PendingChangeApplier field="tagline" draft={draft} setDraft={setDraft} label="Tagline" />
      </FieldRow>

      <FieldRow label="Version">
        <input
          type="text"
          value={draft.version}
          onChange={(e) => setDraft({ ...draft, version: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
      <FieldRow label="Category">
        <input
          type="text"
          value={draft.category ?? ""}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
      <FieldRow label="Creator">
        <input
          type="text"
          value={draft.creator}
          onChange={(e) => setDraft({ ...draft, creator: e.target.value })}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>

      <FieldRow label="Tags">
        <TagEditor
          tags={draft.tags}
          onChange={(tags) => setDraft({ ...draft, tags })}
          character={draft}
        />
      </FieldRow>

      <AvatarField draft={draft} setDraft={setDraft} />

      <FieldRow label="Scope">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-dim)]">
          <input
            type="checkbox"
            checked={draft.isGlobal}
            onChange={(e) => setDraft({ ...draft, isGlobal: e.target.checked })}
            className="size-3.5 rounded border-[var(--color-border)] bg-[var(--color-bg)] accent-[var(--color-accent)]"
          />
          <span>Global (available in every project)</span>
        </label>
      </FieldRow>
    </div>
  );
}

function TagEditor({
  tags,
  onChange,
  character,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  character: CharacterRecord;
}) {
  const [input, setInput] = useState("");
  const runner = useAssistRunner();
  const job = useAssistJob(runner.jobId);
  useCancelOnUnmount(runner.jobId);
  const addPendingChange = useCharacterAssistStore((s) => s.addPendingChange);
  const tone = useSettingsStore((s) => s.characterAssistTone);

  const handleAdd = () => {
    const value = input.trim().toLowerCase();
    if (!value) return;
    if (tags.includes(value)) {
      setInput("");
      return;
    }
    onChange([...tags, value]);
    setInput("");
  };

  const handleRemove = (t: string) => {
    onChange(tags.filter((x) => x !== t));
  };

  const handleSuggest = () => {
    runner.start(
      {
        action: "suggest_tags",
        characterId: character.id,
        options: { tone: tone as never },
      },
      { character },
    );
  };

  if (job.result && job.result.card) {
    const suggested = (job.result.card.tags as unknown as string[] | undefined) ?? [];
    if (suggested.length > 0) {
      const merged = Array.from(new Set([...tags, ...suggested.map((s) => s.toLowerCase())]));
      addPendingChange({
        characterId: character.id,
        field: "tags",
        label: "Tags",
        before: tags,
        after: merged,
        source: "suggest_tags",
      });
    }
    job.clear();
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-2 py-0.5 text-[11.5px] text-white"
          >
            {t}
            <button
              type="button"
              onClick={() => handleRemove(t)}
              className="text-[var(--color-text-dim)] hover:text-white"
              aria-label={`Remove ${t}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="Add a tag and press Enter"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAdd}
          className="rounded-md border border-[var(--color-border)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
        >
          Add
        </button>
        <WandButton
          actions={[
            {
              id: "suggest",
              label: "Suggest tags",
              description: "Generate tags from the character summary.",
              instruction: "Suggest tags.",
            },
          ]}
          onAction={handleSuggest}
          busy={job.running}
        />
      </div>
      <StreamingPreview buffer={job.buffer} busy={job.running} onCancel={runner.cancel} hint="Suggesting tags…" />
      <PendingChangeApplier field="tags" draft={character} setDraft={(updated) => {
        void updated;
      }} label="Tags" />
    </div>
  );
}

function AvatarField({
  draft,
  setDraft,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!draft.avatarPath) return;
    import("../../character-avatar").then(({ ensureCharacterAvatarUrl }) =>
      ensureCharacterAvatarUrl(draft.avatarPath).then((u) => {
        if (!cancelled) setAvatarUrl(u);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [draft.avatarPath]);

  const handlePick = async () => {
    setError(null);
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        directory: false,
        filters: [
          { name: "Image", extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
        ],
      });
      if (!path || typeof path !== "string") return;
      setBusy(true);
      const { invoke } = await import("@tauri-apps/api/core");
      const { filePathToUrl } = await import("../../character-avatar");
      const url = filePathToUrl(path);
      setPreviewUrl(url);
      const bytes = await invoke<number[]>("read_binary_file", { path });
      const u8 = new Uint8Array(bytes);
      const { saveCharacterAvatar } = await import("../../character-avatar");
      const relative = await saveCharacterAvatar(draft.id, u8);
      setDraft({ ...draft, avatarPath: relative });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    if (!draft.avatarPath) return;
    try {
      const { deleteCharacterAvatar } = await import("../../character-avatar");
      await deleteCharacterAvatar(draft.avatarPath);
      setDraft({ ...draft, avatarPath: undefined });
      setPreviewUrl(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        Avatar
      </span>
      <div className="flex items-start gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-2xl ring-1 ring-inset ring-white/10">
          {avatarUrl || previewUrl ? (
            <img
              src={avatarUrl ?? previewUrl ?? ""}
              alt="Avatar preview"
              className="size-full object-cover"
            />
          ) : (
            <div
              className={`size-full ${AVATAR_GRADIENTS[(draft.avatarColor as CharacterAvatarColor) ?? "indigo"]}`}
            />
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {CHARACTER_AVATAR_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, avatarColor: c })}
                className={`size-6 rounded ${AVATAR_GRADIENTS[c]} transition-transform hover:scale-110 ${
                  c === draft.avatarColor
                    ? "ring-2 ring-white"
                    : "ring-1 ring-inset ring-white/10"
                }`}
                aria-label={c}
              />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handlePick}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-1.5 text-[11.5px] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              {busy ? "Uploading…" : draft.avatarPath ? "Replace image" : "Upload image"}
            </button>
            {draft.avatarPath && (
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1.5 rounded-md border border-red-400/30 bg-red-500/10 px-2.5 py-1.5 text-[11.5px] text-red-200 hover:bg-red-500/20"
              >
                Remove image
              </button>
            )}
            <span className="text-[10.5px] text-[var(--color-text-dim)]">
              PNG, JPEG, GIF, or WebP. Max 4 MB.
            </span>
          </div>
          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-[11.5px] text-red-300">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
