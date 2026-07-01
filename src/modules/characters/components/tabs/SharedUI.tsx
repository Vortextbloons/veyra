import { useMemo } from "react";
import type { CharacterRecord } from "../../character-types";
import { useCharacterAssistStore, selectPendingChangesFor } from "../../ai-assist/ai-assist-store";
import { SuggestionActions } from "../../ai-assist/WandButton";

export function FieldRow({
  label,
  hint,
  children,
  required,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11.5px] font-medium uppercase tracking-wide text-[var(--color-text-dim)]">
        {label}
        {required && <span className="ml-1 text-red-300">*</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-[var(--color-text-dim)]/80">{hint}</span>}
    </label>
  );
}

export function PendingChangeApplier({
  field,
  label,
  draft,
  setDraft,
  onApplyValue,
}: {
  field: string;
  label: string;
  draft: CharacterRecord;
  setDraft: (c: CharacterRecord) => void;
  onApplyValue?: (v: unknown) => void;
}) {
  const rawPendingChanges = useCharacterAssistStore((s) => s.pendingChanges);
  const pendingChanges = useMemo(
    () =>
      selectPendingChangesFor(rawPendingChanges, draft.id).filter((c) => c.field === field),
    [rawPendingChanges, draft.id, field],
  );
  const discardPendingChange = useCharacterAssistStore((s) => s.discardPendingChange);
  const markPendingChangeApplied = useCharacterAssistStore((s) => s.markPendingChangeApplied);

  if (pendingChanges.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1.5">
      {pendingChanges.map((change) => (
        <div
          key={change.id}
          className="rounded-md border border-emerald-300/25 bg-emerald-300/[0.04] p-2"
        >
          <div className="mb-1 flex items-center justify-between text-[10.5px] uppercase tracking-wide text-emerald-200/80">
            <span>AI suggestion · {label}</span>
          </div>
          <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap text-[12px] text-white/85">
            {typeof change.after === "string"
              ? change.after
              : JSON.stringify(change.after, null, 2)}
          </pre>
          <SuggestionActions
            onApply={() => {
              if (onApplyValue) {
                onApplyValue(change.after);
              } else {
                setDraft({ ...draft, [field]: change.after } as CharacterRecord);
              }
              markPendingChangeApplied(change.id);
            }}
            onReroll={() => {
              discardPendingChange(change.id);
            }}
            onDiscard={() => {
              discardPendingChange(change.id);
            }}
          />
        </div>
      ))}
    </div>
  );
}
