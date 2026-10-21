type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
};

/** Compact row of mutually exclusive buttons. */
export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
}: SegmentedControlProps<T>) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-md px-3 py-1.5 text-[11px] font-medium transition-colors ${
            value === option.value
              ? "bg-[var(--color-accent)] text-white"
              : "bg-[var(--color-bg)] text-[var(--color-text-dim)] hover:bg-white/5 hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
