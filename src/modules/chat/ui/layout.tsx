import { defineComponent, FormNameContext } from "@openuidev/react-lang";
import { useId, type CSSProperties } from "react";
import { z } from "zod/v4";
import { bg, children, color, cx, length, onColor, radius, radiusSchema, size, space } from "./style";

const align = z.enum(["start", "center", "end", "stretch"]);
const justify = z.enum(["start", "center", "end", "between"]);
const FLEX: Record<string, string> = {
  start: "flex-start",
  end: "flex-end",
  center: "center",
  stretch: "stretch",
  between: "space-between",
};

type FlexProps = { gap?: number; align?: string; justify?: string; wrap?: boolean };
const flexStyle = (props: FlexProps, column = false): CSSProperties => ({
  gap: space(props.gap),
  alignItems: props.align ? FLEX[props.align] : undefined,
  justifyContent: props.justify ? FLEX[props.justify] : undefined,
  flexWrap: props.wrap ? "wrap" : undefined,
  textAlign: column && (props.align === "center" || props.align === "end") ? props.align : undefined,
});

export const Box = defineComponent({
  name: "Box",
  props: z.object({
    children: children.optional(),
    direction: z.enum(["row", "col"]).optional(),
    gap: z.number().optional(),
    padding: z.number().optional(),
    background: color.optional(),
    radius: radiusSchema.optional(),
    border: z.boolean().optional(),
    width: length.optional(),
    height: length.optional(),
    flex: z.number().optional(),
    align: align.optional(),
    justify: justify.optional(),
    wrap: z.boolean().optional(),
  }),
  description: "Flex container, a column by default. radius also clips the content.",
  component: ({ props, renderNode }) => {
    const row = props.direction === "row";
    return (
      <div
        className={cx("flex min-w-0", row ? "flex-row items-center" : "flex-col")}
        style={{
          ...flexStyle(props, !row),
          padding: space(props.padding),
          background: bg(props.background),
          ...onColor(props.background),
          borderRadius: radius(props.radius),
          overflow: props.radius !== undefined ? "clip" : undefined,
          border: props.border ? "1px solid color-mix(in srgb, var(--color-text) 10%, transparent)" : undefined,
          width: size(props.width),
          height: size(props.height),
          flex: props.flex != null ? `${Math.max(0, props.flex)} 1 0%` : typeof props.width === "number" ? "0 0 auto" : undefined,
        }}
      >
        {renderNode(props.children)}
      </div>
    );
  },
});

export const Row = defineComponent({
  name: "Row",
  props: z.object({
    children,
    gap: z.number().optional(),
    align: align.optional(),
    justify: justify.optional(),
    wrap: z.boolean().optional(),
  }),
  description: "Horizontal layout; items are vertically centered.",
  component: ({ props, renderNode }) => (
    <div className="flex min-w-0 flex-row items-center" style={flexStyle(props)}>
      {renderNode(props.children)}
    </div>
  ),
});

export const Col = defineComponent({
  name: "Col",
  props: z.object({ children, gap: z.number().optional(), align: align.optional() }),
  description: "Vertical layout. Without gap it spaces blocks like an article.",
  component: ({ props, renderNode }) => (
    <div
      className="flex min-w-0 flex-col"
      style={{ ...flexStyle(props, true), gap: space(props.gap) ?? "12px" }}
    >
      {renderNode(props.children)}
    </div>
  ),
});

export const Grid = defineComponent({
  name: "Grid",
  props: z.object({
    children,
    columns: z.number().optional(),
    minChildWidth: z.number().optional(),
    gap: z.number().optional(),
  }),
  description: "Equal columns (default 2). With minChildWidth (px), columns drop on narrow screens.",
  component: ({ props, renderNode }) => {
    const columns = Math.min(12, Math.max(1, Math.round(props.columns ?? 2)));
    const gap = space(props.gap) ?? "12px";
    const min = props.minChildWidth
      ? `max(${Math.max(0, props.minChildWidth)}px, (100% - ${columns - 1} * ${gap}) / ${columns})`
      : null;
    return (
      <div
        className="min-w-0"
        style={{
          display: "grid",
          gap,
          gridTemplateColumns: min
            ? `repeat(auto-fill, minmax(min(100%, ${min}), 1fr))`
            : `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {renderNode(props.children)}
      </div>
    );
  },
});

export const Card = defineComponent({
  name: "Card",
  props: z.object({
    children,
    variant: z.enum(["outline", "soft"]).optional(),
    padding: z.number().optional(),
    gap: z.number().optional(),
  }),
  description: "Panel with a border; soft is a filled panel for summaries.",
  component: ({ props, renderNode }) => (
    <section
      className={cx(
        "flex min-w-0 flex-col rounded-xl border",
        props.variant === "soft"
          ? "border-white/[0.07] bg-white/[0.045]"
          : "border-white/[0.09] bg-white/[0.02]",
      )}
      style={{ padding: space(props.padding) ?? "14px", gap: space(props.gap) ?? "10px" }}
    >
      {renderNode(props.children)}
    </section>
  ),
});

export const Divider = defineComponent({
  name: "Divider",
  props: z.object({}),
  description: "",
  component: () => <hr className="m-0 h-px w-full border-0 bg-white/[0.08]" />,
});

export const Spacer = defineComponent({
  name: "Spacer",
  props: z.object({}),
  description: "Fills the free space in a Row.",
  component: () => <div className="flex-1" aria-hidden />,
});

export const Form = defineComponent({
  name: "Form",
  props: z.object({ children }),
  description: "Groups fields; their values go with any @ToAssistant inside.",
  component: function FormView({ props, renderNode, statementId }) {
    const id = useId();
    return (
      <FormNameContext.Provider value={statementId ?? id}>
        <form className="flex min-w-0 flex-col gap-2.5" onSubmit={(event) => event.preventDefault()}>
          {renderNode(props.children)}
        </form>
      </FormNameContext.Provider>
    );
  },
});
