import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { children, color, cx, fg, fillColor, length, size } from "./style";

/**
 * Drawing primitives. Every attribute takes an expression, so `$state` can move
 * a shape while the page is live.
 */
const num = z.number();

export const G = defineComponent({
  name: "G",
  props: z.object({
    children,
    transform: z.string().optional(),
    opacity: num.optional(),
  }),
  description: 'Group; transform like "rotate(30 50 50)" or "translate(10 0)".',
  component: ({ props, renderNode }) => (
    <g transform={props.transform} opacity={props.opacity}>
      {renderNode(props.children)}
    </g>
  ),
});

const shapeStyle = (props: { fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }) => ({
  fill: props.fill === undefined ? "none" : fillColor(props.fill) ?? "none",
  stroke: props.stroke === undefined ? undefined : fg(props.stroke),
  strokeWidth: props.strokeWidth,
  opacity: props.opacity,
});

export const Circle = defineComponent({
  name: "Circle",
  props: z.object({
    cx: num,
    cy: num,
    r: num,
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: num.optional(),
    opacity: num.optional(),
  }),
  description: "",
  component: ({ props }) => <circle cx={props.cx} cy={props.cy} r={Math.max(0, props.r)} {...shapeStyle(props)} />,
});

export const Ellipse = defineComponent({
  name: "Ellipse",
  props: z.object({
    cx: num,
    cy: num,
    rx: num,
    ry: num,
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: num.optional(),
    opacity: num.optional(),
  }),
  description: "",
  component: ({ props }) => (
    <ellipse cx={props.cx} cy={props.cy} rx={Math.max(0, props.rx)} ry={Math.max(0, props.ry)} {...shapeStyle(props)} />
  ),
});

export const Rect = defineComponent({
  name: "Rect",
  props: z.object({
    x: num,
    y: num,
    width: num,
    height: num,
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: num.optional(),
    opacity: num.optional(),
    rx: num.optional(),
  }),
  description: "",
  component: ({ props }) => (
    <rect
      x={props.x}
      y={props.y}
      width={Math.max(0, props.width)}
      height={Math.max(0, props.height)}
      rx={props.rx}
      {...shapeStyle(props)}
    />
  ),
});

export const Line = defineComponent({
  name: "Line",
  props: z.object({
    x1: num,
    y1: num,
    x2: num,
    y2: num,
    stroke: color.optional(),
    strokeWidth: num.optional(),
    opacity: num.optional(),
  }),
  description: "",
  component: ({ props }) => (
    <line
      x1={props.x1}
      y1={props.y1}
      x2={props.x2}
      y2={props.y2}
      stroke={fg(props.stroke) ?? "var(--color-text)"}
      strokeWidth={props.strokeWidth}
      opacity={props.opacity}
    />
  ),
});

export const Path = defineComponent({
  name: "Path",
  props: z.object({
    d: z.string(),
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: num.optional(),
    opacity: num.optional(),
  }),
  description: "",
  component: ({ props }) => <path d={props.d} {...shapeStyle(props)} />,
});

export const Polyline = defineComponent({
  name: "Polyline",
  props: z.object({
    points: z.string(),
    stroke: color.optional(),
    strokeWidth: num.optional(),
    fill: color.optional(),
    opacity: num.optional(),
  }),
  description: 'points like "0,0 10,5 20,0".',
  component: ({ props }) => <polyline points={props.points} {...shapeStyle(props)} />,
});

export const Polygon = defineComponent({
  name: "Polygon",
  props: z.object({
    points: z.string(),
    fill: color.optional(),
    stroke: color.optional(),
    strokeWidth: num.optional(),
    opacity: num.optional(),
  }),
  description: "",
  component: ({ props }) => <polygon points={props.points} {...shapeStyle(props)} />,
});

export const SvgText = defineComponent({
  name: "SvgText",
  props: z.object({
    text: z.string(),
    x: num,
    y: num,
    size: num.optional(),
    fill: color.optional(),
    anchor: z.enum(["start", "middle", "end"]).optional(),
    weight: z.enum(["normal", "medium", "semibold"]).optional(),
  }),
  description: "",
  component: ({ props }) => (
    <text
      x={props.x}
      y={props.y}
      fontSize={props.size ?? 11}
      fill={fg(props.fill) ?? "var(--color-text)"}
      textAnchor={props.anchor ?? "start"}
      fontWeight={props.weight === "semibold" ? 600 : props.weight === "medium" ? 500 : 400}
    >
      {props.text}
    </text>
  ),
});

export const Svg = defineComponent({
  name: "Svg",
  props: z.object({
    children,
    viewBox: z.string(),
    width: length.optional(),
    height: length.optional(),
  }),
  description: "A drawing for steps, parts, mechanisms, diagrams and layouts. Scales to its width.",
  component: ({ props, renderNode }) => (
    <svg
      viewBox={props.viewBox}
      className={cx("mx-auto block w-full")}
      style={{ width: size(props.width), height: size(props.height), maxHeight: props.height ? undefined : 340 }}
      role="img"
    >
      {renderNode(props.children)}
    </svg>
  ),
});
