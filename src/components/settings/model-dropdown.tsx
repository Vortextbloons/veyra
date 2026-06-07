import { useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { ModelIcon } from "@/components/model-icon";
import { useClickOutside } from "@/hooks/use-click-outside";

export type ModelDropdownOption = {
  id: string;
  name: string;
  contextWindow?: number;
  size?: string;
};

type ModelDropdownProps = {
  models: ModelDropdownOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder: string;
};

export function ModelDropdown({
  models,
  value,
  onChange,
  placeholder,
}: ModelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const current = models.find((m) => m.id === value);

  useClickOutside(ref, open, () => setOpen(false));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter((m) => m.name.toLowerCase().includes(q));
  }, [models, query]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-full items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-[12px] transition-colors hover:border-[var(--color-border-strong)]"
      >
        <div className="grid size-5 shrink-0 place-items-center rounded bg-indigo-500/20 text-indigo-300">
          <ModelIcon modelId={current?.id ?? ""} className="size-full" />
        </div>
        <span className="min-w-0 flex-1 truncate text-left text-white">
          {current?.name ?? placeholder}
        </span>
        <ChevronDown
          className={`size-3 shrink-0 text-[var(--color-text-dim)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-2xl shadow-black/50">
          {models.length > 4 && (
            <div className="border-b border-[var(--color-border)] p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models..."
                className="w-full rounded-md bg-[var(--color-bg)] px-2 py-1.5 text-[12px] placeholder:text-[var(--color-text-dim)] focus:outline-none"
              />
            </div>
          )}
          <div className="max-h-60 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                !value
                  ? "bg-[var(--color-accent-soft)] text-white"
                  : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
              }`}
            >
              <span className="truncate">{placeholder}</span>
            </button>
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange(m.id);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[12px] transition-colors ${
                  value === m.id
                    ? "bg-[var(--color-accent-soft)] text-white"
                    : "text-[var(--color-text-dim)] hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                <div className="grid size-5 shrink-0 place-items-center rounded bg-indigo-500/20 text-indigo-300">
                  <ModelIcon modelId={m.id} className="size-full" />
                </div>
                <span className="min-w-0 flex-1 truncate text-left">{m.name}</span>
                {m.contextWindow && (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--color-text-dim)]">
                    {(m.contextWindow / 1000).toFixed(0)}k
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
