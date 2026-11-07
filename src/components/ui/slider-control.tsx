type SliderControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  formatValue: (value: number) => string;
  description?: string;
  variant?: "compact" | "described" | "card";
};

export function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  formatValue,
  description,
  variant = "described",
}: SliderControlProps) {
  const percent = ((value - min) / (max - min)) * 100;

  if (variant === "compact") {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-[var(--color-text)]">{label}</label>
          <span className="text-[10px] text-[var(--color-text-dim)]">{formatValue(value)}</span>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-indigo-500 [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-indigo-400"
        />
      </div>
    );
  }

  const track = (
    <div className="relative flex h-5 items-center">
      <div className="h-1.5 w-full rounded-full bg-white/[0.08]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span
        aria-hidden
        className="pointer-events-none absolute size-3 -translate-x-1/2 rounded-full border border-black/40 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.5)]"
        style={{ left: `${percent}%` }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
    </div>
  );

  if (variant === "card") {
    return (
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] px-4 py-3">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-[12.5px] font-medium text-white">{label}</div>
            {description && (
              <div className="text-[11px] text-[var(--color-text-dim)]">{description}</div>
            )}
          </div>
          <span className="shrink-0 rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white">
            {formatValue(value)}
          </span>
        </div>
        {track}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-[13px] font-medium text-white">{label}</p>
        <span className="shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11.5px] tabular-nums text-white">
          {formatValue(value)}
        </span>
      </div>
      {description && (
        <p className="mb-1.5 text-[12px] leading-relaxed text-[var(--color-text-dim)]">
          {description}
        </p>
      )}
      {track}
    </div>
  );
}
