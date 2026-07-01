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
    <div className="relative">
      <div className="h-1.5 rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-[var(--color-accent)]"
          style={{ width: `${percent}%` }}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
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
      <div className="mb-1.5 flex items-center justify-between">
        <div className="text-[12px] font-medium text-white">{label}</div>
        <span className="rounded bg-white/[0.06] px-2 py-0.5 font-mono text-[11px] text-white">
          {formatValue(value)}
        </span>
      </div>
      {description && (
        <p className="mb-2 text-[10.5px] text-[var(--color-text-dim)]">{description}</p>
      )}
      {track}
    </div>
  );
}
