/* eslint-disable react-refresh/only-export-components */
import { action, defineComponent, reactive, useFormName, useStateField, useTriggerAction } from "@openuidev/react-lang";
import { useId, type ReactNode } from "react";
import { z } from "zod/v4";
import { iconByName } from "./icons";
import { children, cx, option, radius, radiusSchema, space, textOf, toOption, type Option } from "./style";

type Plan = Parameters<ReturnType<typeof useTriggerAction>>[2];

/** Runs an action prop. With no action, a button sends its label to the assistant. */
function useRunAction() {
  const trigger = useTriggerAction();
  const formName = useFormName();
  return (message: string, plan: unknown, sendLabel: boolean) => {
    if (plan) void trigger(message, formName, plan as Plan);
    else if (sendLabel) void trigger(message, formName);
  };
}

/** The state key of a control: its label, its statement name, or a generated id. */
function useFieldName(label: unknown, statementId?: string) {
  const id = useId();
  return (typeof label === "string" && label) || statementId || id;
}

function Field({ label, children: content }: { label?: string; children: ReactNode }) {
  if (!label) return <>{content}</>;
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-dim)]">{label}</span>
      {content}
    </label>
  );
}

const BUTTON_VARIANT: Record<string, string> = {
  solid: "border-transparent bg-[var(--color-accent)] text-white hover:brightness-110",
  outline: "border-white/[0.14] bg-transparent text-[var(--color-text)] hover:border-white/[0.24] hover:bg-white/[0.05]",
  soft: "border-transparent bg-white/[0.07] text-[var(--color-text)] hover:bg-white/[0.11]",
  ghost: "border-transparent bg-transparent text-[var(--color-text-dim)] hover:bg-white/[0.06] hover:text-[var(--color-text)]",
};
const BUTTON_TONE: Record<string, string> = {
  danger: "border-transparent bg-red-500/85 text-white hover:brightness-110",
  success: "border-transparent bg-emerald-500/85 text-white hover:brightness-110",
};
const BUTTON_SIZE: Record<string, string> = {
  sm: "min-h-7 gap-1 px-2.5 text-[11px]",
  md: "min-h-8 gap-1.5 px-3 text-[11.5px]",
  lg: "min-h-9 gap-1.5 px-4 text-[12.5px]",
};

export const Button = defineComponent({
  name: "Button",
  props: z.object({
    label: z.string(),
    action: action().optional(),
    variant: z.enum(["solid", "outline", "soft", "ghost"]).optional(),
    color: z.enum(["primary", "danger", "success"]).optional(),
    size: z.enum(["sm", "md", "lg"]).optional(),
    icon: z.string().optional(),
    disabled: z.boolean().optional(),
    block: z.boolean().optional(),
  }),
  description: "icon is a lucide name. Buttons without an action send their label to the assistant.",
  component: function ButtonView({ props, statementId }) {
    const run = useRunAction();
    const Glyph = props.icon ? iconByName(props.icon) : null;
    const variant = props.variant ?? "solid";
    return (
      <button
        type="button"
        disabled={props.disabled === true}
        onClick={(event) => run(textOf(event.currentTarget) || props.label, props.action, true)}
        aria-label={props.label}
        className={cx(
          "inline-flex select-none items-center justify-center rounded-lg border font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60 disabled:cursor-not-allowed disabled:opacity-45",
          BUTTON_SIZE[props.size ?? "md"],
          props.color ? BUTTON_TONE[props.color] ?? BUTTON_VARIANT[variant] : BUTTON_VARIANT[variant],
          props.block ? "w-full" : "self-start",
        )}
        data-statement={statementId}
      >
        {Glyph ? <Glyph className="size-3.5" aria-hidden /> : null}
        {props.label}
      </button>
    );
  },
});

export const IconButton = defineComponent({
  name: "IconButton",
  props: z.object({
    icon: z.string(),
    action: action().optional(),
    label: z.string().optional(),
    variant: z.enum(["outline", "ghost", "solid"]).optional(),
  }),
  description: "Round icon-only button; label is read aloud.",
  component: function IconButtonView({ props }) {
    const run = useRunAction();
    const Glyph = iconByName(props.icon);
    const variant = props.variant ?? "outline";
    return (
      <button
        type="button"
        aria-label={props.label ?? props.icon}
        title={props.label ?? props.icon}
        onClick={(event) => run(textOf(event.currentTarget) || props.label || props.icon, props.action, false)}
        className={cx(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
          BUTTON_VARIANT[variant],
        )}
      >
        <Glyph className="size-3.5" aria-hidden />
      </button>
    );
  },
});

export const Pressable = defineComponent({
  name: "Pressable",
  props: z.object({
    children,
    action: action().optional(),
    selected: z.boolean().optional(),
    padding: z.number().optional(),
    radius: radiusSchema.optional(),
  }),
  description: "Makes any content clickable, such as a tile, a list row or a swatch.",
  component: function PressableView({ props, renderNode, statementId }) {
    const run = useRunAction();
    return (
      <button
        type="button"
        aria-pressed={props.selected}
        onClick={(event) => run(textOf(event.currentTarget), props.action, false)}
        data-statement={statementId}
        className={cx(
          "min-w-0 rounded-lg border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
          props.selected
            ? "border-violet-300/45 bg-violet-300/[0.1]"
            : "border-transparent hover:border-white/[0.12] hover:bg-white/[0.04]",
        )}
        style={{ padding: space(props.padding) ?? "6px", borderRadius: radius(props.radius) }}
      >
        {renderNode(props.children)}
      </button>
    );
  },
});

const numberText = (value: number) =>
  value.toLocaleString("en-US", { maximumFractionDigits: 2 });

export const Slider = defineComponent({
  name: "Slider",
  props: z.object({
    value: reactive(z.number()),
    min: z.number(),
    max: z.number(),
    step: z.number().optional(),
    label: z.string().optional(),
    unit: z.string().optional(),
    marks: z.array(z.object({ value: z.number(), label: z.string() })).optional(),
  }),
  description: 'Shows label and value; unit like "%" or "$" formats the value.',
  component: function SliderView({ props, statementId }) {
    const field = useStateField(useFieldName(props.label, statementId), props.value);
    const min = Number.isFinite(props.min) ? props.min : 0;
    const max = Number.isFinite(props.max) && props.max > min ? props.max : min + 100;
    const step = props.step && props.step > 0 ? props.step : 1;
    const raw = typeof field.value === "number" ? field.value : Number(field.value);
    const value = Number.isFinite(raw) ? Math.min(max, Math.max(min, raw)) : min;
    const unit = props.unit ?? "";
    const prefix = /^[$€£¥₹]/.test(unit);
    const readout = prefix ? `${unit}${numberText(value)}` : `${numberText(value)}${unit}`;
    const marks = (props.marks ?? []).filter(
      (mark) => mark && Number.isFinite(mark.value) && mark.value >= min && mark.value <= max,
    );
    const id = useId();
    return (
      <div className="flex min-w-0 flex-col gap-1">
        {(props.label || unit) && (
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={id} className="text-[11px] font-medium text-[var(--color-text)]">
              {props.label ?? ""}
            </label>
            <output htmlFor={id} className="text-[11px] font-semibold tabular-nums text-[var(--color-focus)]">
              {readout}
            </output>
          </div>
        )}
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={props.label ? undefined : "Value"}
          aria-valuetext={readout}
          onChange={(event) => field.setValue(Number(event.target.value))}
          className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-[var(--color-accent)]"
        />
        {marks.length > 0 && (
          <div className="flex justify-between text-[9.5px] text-[var(--color-text-dim)]" aria-hidden>
            {marks.map((mark) => (
              <span key={mark.value}>{mark.label}</span>
            ))}
          </div>
        )}
      </div>
    );
  },
});

export const SegmentedControl = defineComponent({
  name: "SegmentedControl",
  props: z.object({
    value: reactive(z.string()),
    options: z.array(option),
    block: z.boolean().optional(),
  }),
  description: "2 to 4 short choices in a row.",
  component: function SegmentedControlView({ props, statementId }) {
    const field = useStateField(useFieldName(undefined, statementId), props.value);
    const options = (props.options ?? []).map((entry) => toOption(entry as Option));
    const selected = typeof field.value === "string" ? field.value : String(field.value ?? "");
    return (
      <div
        role="group"
        className={cx(
          "inline-flex min-w-0 items-center gap-0.5 rounded-lg border border-white/[0.09] bg-white/[0.03] p-0.5",
          props.block && "flex w-full",
        )}
      >
        {options.map((entry) => {
          const active = entry.value === selected;
          return (
            <button
              key={entry.value}
              type="button"
              aria-pressed={active}
              onClick={() => field.setValue(entry.value)}
              className={cx(
                "min-h-6 rounded-md px-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
                props.block && "flex-1",
                active
                  ? "bg-white/[0.12] text-[var(--color-text)] shadow-sm"
                  : "text-[var(--color-text-dim)] hover:text-[var(--color-text)]",
              )}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    );
  },
});

export const Checkbox = defineComponent({
  name: "Checkbox",
  props: z.object({
    checked: reactive(z.boolean()),
    label: z.string(),
    lineThrough: z.boolean().optional(),
  }),
  description: "lineThrough strikes the label when checked, for to-do lists.",
  component: function CheckboxView({ props, statementId }) {
    const field = useStateField(useFieldName(props.label, statementId), props.checked);
    const checked = field.value === true;
    return (
      <label className="flex cursor-pointer items-start gap-2 text-[12px] leading-snug text-[var(--color-text)]">
        <input
          type="checkbox"
          checked={checked}
          onChange={(event) => field.setValue(event.target.checked)}
          className="mt-[2px] size-3.5 shrink-0 cursor-pointer accent-[var(--color-accent)]"
        />
        <span className={cx(checked && props.lineThrough && "text-[var(--color-text-dim)] line-through")}>
          {String(props.label ?? "")}
        </span>
      </label>
    );
  },
});

const inputClass =
  "min-h-8 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-2.5 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-dim)]/70 focus:border-[var(--color-accent)]/60 focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]/30";

export const Input = defineComponent({
  name: "Input",
  props: z.object({
    value: reactive(z.union([z.string(), z.number()])),
    label: z.string().optional(),
    type: z.enum(["text", "number"]).optional(),
    placeholder: z.string().optional(),
  }),
  description: "Text or number field; a number field stores numbers.",
  component: function InputView({ props, statementId }) {
    const field = useStateField(useFieldName(props.label, statementId), props.value);
    const value = field.value == null ? "" : String(field.value);
    return (
      <Field label={props.label}>
        <input
          type={props.type === "number" ? "number" : "text"}
          value={value}
          placeholder={props.placeholder}
          onChange={(event) =>
            field.setValue(
              props.type === "number" ? Number(event.target.value) : event.target.value,
            )
          }
          className={inputClass}
        />
      </Field>
    );
  },
});

export const TextArea = defineComponent({
  name: "TextArea",
  props: z.object({
    value: reactive(z.string()),
    label: z.string().optional(),
    placeholder: z.string().optional(),
    rows: z.number().optional(),
  }),
  description: "",
  component: function TextAreaView({ props, statementId }) {
    const field = useStateField(useFieldName(props.label, statementId), props.value);
    const rows = props.rows && props.rows > 0 ? Math.min(12, Math.round(props.rows)) : 3;
    return (
      <Field label={props.label}>
        <textarea
          rows={rows}
          value={field.value == null ? "" : String(field.value)}
          placeholder={props.placeholder}
          onChange={(event) => field.setValue(event.target.value)}
          className={cx(inputClass, "resize-y py-1.5 leading-relaxed")}
        />
      </Field>
    );
  },
});

export const Select = defineComponent({
  name: "Select",
  props: z.object({
    value: reactive(z.string()),
    options: z.array(option),
    label: z.string().optional(),
    placeholder: z.string().optional(),
  }),
  description: "Dropdown, for long option lists.",
  component: function SelectView({ props, statementId }) {
    const field = useStateField(useFieldName(props.label, statementId), props.value);
    const options = (props.options ?? []).map((entry) => toOption(entry as Option));
    return (
      <Field label={props.label}>
        <select
          value={typeof field.value === "string" ? field.value : String(field.value ?? "")}
          onChange={(event) => field.setValue(event.target.value)}
          className={inputClass}
        >
          {props.placeholder ? <option value="">{props.placeholder}</option> : null}
          {options.map((entry) => (
            <option key={entry.value} value={entry.value} className="bg-[var(--color-panel)]">
              {entry.label}
            </option>
          ))}
        </select>
      </Field>
    );
  },
});

const choice = z.union([
  z.string(),
  z.object({ value: z.string(), label: z.string(), description: z.string().optional() }),
]);
type Choice = { value: string; label: string; description?: string };
const choiceList = (value: unknown): Choice[] =>
  Array.isArray(value)
    ? (value.flat() as (string | Choice)[])
        .filter((entry) => entry != null)
        .map((entry) => (typeof entry === "string" ? { value: entry, label: entry } : entry))
    : [];

export const RadioGroup = defineComponent({
  name: "RadioGroup",
  props: z.object({
    value: reactive(z.string()),
    options: z.array(choice),
    label: z.string().optional(),
    variant: z.enum(["list", "pills", "cards"]).optional(),
  }),
  description: "pills for short choices; cards for choices that need a description line.",
  component: function RadioGroupView({ props, statementId }) {
    const field = useStateField(useFieldName(props.label, statementId), props.value);
    const selected = typeof field.value === "string" ? field.value : String(field.value ?? "");
    const options = choiceList(props.options);
    const variant = props.variant ?? "list";
    return (
      <Field label={props.label}>
        <div
          role="radiogroup"
          aria-label={props.label}
          className={cx(
            "flex min-w-0 gap-1.5",
            variant === "list" || variant === "cards" ? "flex-col" : "flex-row flex-wrap",
          )}
        >
          {options.map((entry) => {
            const active = entry.value === selected;
            return (
              <button
                key={entry.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => field.setValue(entry.value)}
                className={cx(
                  "text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/60",
                  variant === "pills"
                    ? "rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    : "rounded-lg border px-2.5 py-1.5",
                  variant === "list" && "flex items-center gap-2",
                  active
                    ? "border-violet-300/45 bg-violet-300/[0.1] text-[var(--color-text)]"
                    : "border-white/[0.09] bg-white/[0.02] text-[var(--color-text-dim)] hover:border-white/[0.16] hover:text-[var(--color-text)]",
                )}
              >
                {variant === "list" ? (
                  <span
                    aria-hidden
                    className={cx(
                      "size-3 shrink-0 rounded-full border",
                      active ? "border-[var(--color-focus)] bg-[var(--color-focus)]" : "border-white/25",
                    )}
                  />
                ) : null}
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cx(variant !== "pills" && "text-[11.5px] font-medium")}>{entry.label}</span>
                  {entry.description ? (
                    <span className="text-[10.5px] leading-snug text-[var(--color-text-dim)]">{entry.description}</span>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
    );
  },
});

