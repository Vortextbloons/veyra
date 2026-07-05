import type { GeneratedDraft } from "./character-draft-types";

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline = false,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
        {label}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-emerald-300/40 focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white placeholder:text-[var(--color-text-dim)]/50 focus:border-emerald-300/40 focus:outline-none"
        />
      )}
    </label>
  );
}

export function DraftPreview({
  draft,
  setDraft,
}: {
  draft: GeneratedDraft;
  setDraft: (d: GeneratedDraft | null) => void;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-md border border-emerald-300/20 bg-emerald-300/[0.03] p-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-200/80">
        Draft preview
      </h3>
      <div className="grid grid-cols-2 gap-2">
        <Field
          label="Name"
          value={draft.name}
          onChange={(v) => setDraft({ ...draft, name: v })}
          placeholder="(required)"
        />
        <Field
          label="Title"
          value={draft.title}
          onChange={(v) => setDraft({ ...draft, title: v })}
        />
      </div>
      <Field
        label="Tagline"
        value={draft.tagline}
        onChange={(v) => setDraft({ ...draft, tagline: v })}
      />
      <Field
        label="Description"
        value={draft.description}
        onChange={(v) => setDraft({ ...draft, description: v })}
        multiline
        rows={4}
      />
      <Field
        label="Personality"
        value={draft.personality}
        onChange={(v) => setDraft({ ...draft, personality: v })}
        multiline
        rows={3}
      />
      <Field
        label="Scenario"
        value={draft.scenario}
        onChange={(v) => setDraft({ ...draft, scenario: v })}
        multiline
        rows={2}
      />
      <Field
        label="First message"
        value={draft.firstMessage}
        onChange={(v) => setDraft({ ...draft, firstMessage: v })}
        multiline
        rows={3}
      />
      {draft.alternateGreetings.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Alternate greetings ({draft.alternateGreetings.length})
          </span>
          {draft.alternateGreetings.map((g, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="mt-1.5 shrink-0 rounded bg-[var(--color-bg)] px-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                #{i + 1}
              </span>
              <textarea
                value={g}
                onChange={(e) => {
                  const next = [...draft.alternateGreetings];
                  next[i] = e.target.value;
                  setDraft({ ...draft, alternateGreetings: next });
                }}
                rows={2}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-[12px] text-white focus:border-emerald-300/40 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}
      {draft.tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Tags
          </span>
          {draft.tags.map((tag, i) => (
            <span
              key={i}
              className="rounded border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[10.5px] text-emerald-100"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
      {draft.lorebookEntries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[10.5px] font-medium uppercase tracking-wide text-emerald-200/80">
            Suggested lorebook entries ({draft.lorebookEntries.length})
          </span>
          {draft.lorebookEntries.map((e, i) => (
            <div
              key={i}
              className="rounded-md border border-emerald-300/15 bg-[var(--color-bg)]/60 p-2 text-[12px] text-white/80"
            >
              <div className="text-[10.5px] uppercase tracking-wide text-emerald-200/80">
                {e.comment || e.keys.join(", ")}
              </div>
              <div className="mt-0.5 whitespace-pre-wrap text-[11.5px] text-white/65">
                {e.content}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
