import type { CharacterRecord, CharacterSpec, CharacterSource } from "../../character-types";
import { FieldRow } from "./SharedUI";

export function MetadataTab({
  draft,
  setDraft,
}: {
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
}) {
  const setSpec = (spec: CharacterSpec) => setDraft({ ...draft, spec });
  const setSource = (source: CharacterSource) => setDraft({ ...draft, source });
  return (
    <div className="flex flex-col gap-4 p-6">
      <FieldRow label="Spec" hint="Origin format. Affects the badge shown on the detail view.">
        <select
          value={draft.spec}
          onChange={(e) => setSpec(e.target.value as CharacterSpec)}
          className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="veyra">Veyra</option>
          <option value="chara_card_v3">Character Card V3</option>
        </select>
      </FieldRow>
      <FieldRow label="Source" hint="How the card was created. Set automatically on import.">
        <select
          value={draft.source}
          onChange={(e) => setSource(e.target.value as CharacterSource)}
          className="w-48 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        >
          <option value="native">Native</option>
          <option value="imported_ccv3">Imported (CCv3)</option>
          <option value="duplicate">Duplicate</option>
        </select>
      </FieldRow>
      <FieldRow label="Stats" hint="Computed from conversation history.">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Total chats" value={String(draft.stats?.totalChats ?? 0)} />
          <Stat label="Total messages" value={String(draft.stats?.totalMessages ?? 0)} />
          <Stat
            label="Last used"
            value={
              draft.stats?.lastUsedAt
                ? new Date(draft.stats.lastUsedAt).toLocaleString()
                : "—"
            }
          />
        </div>
      </FieldRow>
      <FieldRow label="Creator metadata" hint="Free-form JSON. CCv3 extension data is stored here.">
        <textarea
          value={JSON.stringify(draft.creatorMetadata ?? {}, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              setDraft({ ...draft, creatorMetadata: parsed });
            } catch {
              // ignore parse errors while typing
            }
          }}
          rows={6}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-1.5 font-mono text-[11.5px] text-white focus:border-[var(--color-accent)] focus:outline-none"
        />
      </FieldRow>
      <FieldRow label="Internal ids" hint="Internal references. Read-only.">
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-2 text-[11.5px] text-[var(--color-text-dim)]">
          <div>id: {draft.id}</div>
          <div>createdAt: {draft.createdAt}</div>
          <div>updatedAt: {draft.updatedAt}</div>
        </div>
      </FieldRow>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-2">
      <div className="text-[10px] uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-[12.5px] text-white">{value}</div>
    </div>
  );
}
