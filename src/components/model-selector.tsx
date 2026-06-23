import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Search,
  Star,
  Check,
  Box,
} from "lucide-react";
import { useClickOutside } from "@/hooks/use-click-outside";
import { ModelIcon } from "@/components/model-icon";

export type Model = {
  id: string;
  name: string;
  provider: string;
  contextWindow?: number;
  size?: string;
  isFavorite?: boolean;
  supportsImages?: boolean;
};

type ModelSelectorProps = {
  value: string;
  models?: Model[];
  onChange?: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
};

export function ModelSelector({
  value,
  models = [],
  onChange,
  onToggleFavorite,
}: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const current = useMemo(
    () => models.find((m) => m.id === value) ?? null,
    [models, value],
  );

  useClickOutside(ref, open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => searchRef.current?.focus());
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q),
    );
  }, [models, query]);

  const favorites = filtered.filter((m) => m.isFavorite);
  const rest = filtered.filter((m) => !m.isFavorite);

  return (
    <div ref={ref} className="relative min-w-0">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 items-center gap-2 rounded-md border px-2.5 text-[12px] transition-colors ${
          open
            ? "border-[var(--color-border-strong)] bg-white/[0.04] text-white"
            : "border-[var(--color-border)] bg-[var(--color-panel)] text-white hover:border-[var(--color-border-strong)]"
        }`}
      >
        <div className="grid size-5 place-items-center rounded bg-indigo-500/20 text-indigo-300">
          <ModelIcon modelId={current?.id ?? ""} className="size-full" />
        </div>
        <span className="max-w-[160px] truncate font-medium">
          {current?.name ?? "Select model"}
        </span>
        {current?.contextWindow && (
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-[var(--color-text-dim)]">
            {formatContext(current.contextWindow)}
          </span>
        )}
        <ChevronDown
          className={`size-3 text-[var(--color-text-dim)] transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 top-full z-50 mt-1.5 w-80 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] shadow-xl shadow-black/40"
        >
          <div className="border-b border-[var(--color-border)] p-2">
            <div className="flex items-center gap-2 rounded-md bg-[var(--color-bg)] px-2 py-1.5">
              <Search className="size-3.5 text-[var(--color-text-dim)]" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search models…"
                className="w-full bg-transparent text-[12px] placeholder:text-[var(--color-text-dim)] focus:outline-none"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <div className="grid place-items-center px-4 py-8 text-center">
                <Box className="mb-1.5 size-5 text-[var(--color-text-dim)]" />
                <p className="text-[11.5px] text-[var(--color-text-dim)]">
                  No models match "{query}"
                </p>
              </div>
            ) : (
              <>
                {favorites.length > 0 && (
                  <ModelGroup
                    label="Favorites"
                    models={favorites}
                    value={value}
                    onSelect={(id) => {
                      onChange?.(id);
                      setOpen(false);
                    }}
                    onToggleFavorite={onToggleFavorite}
                  />
                )}
                {(favorites.length > 0 && rest.length > 0) && (
                  <div className="my-1 h-px bg-[var(--color-border)]" />
                )}
                {rest.length > 0 && (
                  <ModelGroup
                    label={favorites.length > 0 ? "All models" : undefined}
                    models={rest}
                    value={value}
                    onSelect={(id) => {
                      onChange?.(id);
                      setOpen(false);
                    }}
                    onToggleFavorite={onToggleFavorite}
                  />
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelGroup({
  label,
  models,
  value,
  onSelect,
  onToggleFavorite,
}: {
  label?: string;
  models: Model[];
  value: string;
  onSelect: (id: string) => void;
  onToggleFavorite?: (id: string) => void;
}) {
  return (
    <div>
      {label && (
        <div className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--color-text-dim)]">
          {label}
        </div>
      )}
      <div className="space-y-0.5">
        {models.map((m) => {
          const active = m.id === value;
          return (
            <div
              key={m.id}
              role="option"
              aria-selected={active}
              className={`group flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors ${
                active
                  ? "bg-[var(--color-accent-soft)]"
                  : "hover:bg-white/[0.04]"
              }`}
              onClick={() => onSelect(m.id)}
            >
              <div
                className={`grid size-6 shrink-0 place-items-center rounded-md ${
                  active
                    ? "bg-[var(--color-accent)] text-white"
                    : "bg-white/[0.04] text-[var(--color-text-dim)]"
                }`}
              >
                <ModelIcon modelId={m.id} className="size-full" />
              </div>
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-[12.5px] font-medium ${
                    active ? "text-white" : "text-[var(--color-text)]"
                  }`}
                >
                  {m.name}
                </div>
                <div className="flex items-center gap-1.5 text-[10.5px] text-[var(--color-text-dim)]">
                  <span className="truncate">{m.provider}</span>
                  {m.size && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="font-mono">{m.size}</span>
                    </>
                  )}
                  {m.contextWindow && (
                    <>
                      <span className="opacity-50">·</span>
                      <span className="font-mono">
                        {formatContext(m.contextWindow)} ctx
                      </span>
                    </>
                  )}
                  {m.supportsImages && (
                    <>
                      <span className="opacity-50">·</span>
                      <span>Vision</span>
                    </>
                  )}
                </div>
              </div>
              <button
                type="button"
                aria-label={m.isFavorite ? "Unfavorite" : "Favorite"}
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.(m.id);
                }}
                className={`grid size-6 shrink-0 place-items-center rounded transition-opacity ${
                  m.isFavorite
                    ? "text-amber-400 opacity-100"
                    : "text-[var(--color-text-dim)] opacity-0 group-hover:opacity-100"
                } hover:bg-white/[0.06]`}
              >
                <Star
                  className="size-3"
                  fill={m.isFavorite ? "currentColor" : "none"}
                />
              </button>
              {active && (
                <Check className="size-3.5 shrink-0 text-[var(--color-accent)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatContext(tokens: number) {
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(tokens % 1000 ? 1 : 0)}K`;
  return `${tokens}`;
}
