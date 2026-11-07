import { tagSchemaId } from "@openuidev/react-lang";
import type { CSSProperties } from "react";
import { z } from "zod/v4";

/**
 * Shared prop schemas and value helpers for the interactive answer library.
 *
 * Model-written style values are treated as untrusted: anything that could
 * load a resource (`url(...)`), read variables, or break out of the declaration
 * is dropped instead of applied.
 */
const UNSAFE_CSS = /(url|image|image-set|cross-fade|element|expression|paint|var|attr|env)\s*\(|@import|[\\;{}<>]/i;

const isSafeCss = (value: string) => !UNSAFE_CSS.test(value);

/** An absolute http(s) URL, or null. Relative URLs would resolve against the app. */
export function webUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

// Shared prop schemas

/** Children slot: any component, or a list of them (from @Each). Printed as `Node[]`. */
const node = z.any();
tagSchemaId(node, "Node");
export const children = z.array(node);

/** A token or a CSS color. Printed once as `Color` and explained in the prompt notes. */
export const color = z.string();
tagSchemaId(color, "Color");

/** A px number or a CSS length such as "50%". Printed as `Length`. */
export const length = z.union([z.number(), z.string()]);
tagSchemaId(length, "Length");

export const radiusSchema = z.union([z.enum(["sm", "md", "lg", "xl", "full"]), z.number()]);
tagSchemaId(radiusSchema, "Radius");

export const option = z.union([z.string(), z.object({ value: z.string(), label: z.string() })]);
export type Option = z.infer<typeof option>;
export const toOption = (value: Option) => (typeof value === "string" ? { value, label: value } : value);

// Values to CSS

export const CHART_COLORS = ["#8b9cff", "#62d6c5", "#f2b36f", "#d28be9", "#7dd3fc", "#a3e635"];

const FOREGROUND: Record<string, string> = {
  ink: "var(--color-text)",
  muted: "var(--color-text-dim)",
  faint: "color-mix(in srgb, var(--color-text-dim) 68%, transparent)",
  canvas: "var(--color-bg)",
  surface: "var(--color-text-dim)",
  info: "#93c5fd",
  success: "#6ee7b7",
  warning: "#fcd34d",
  danger: "#fca5a5",
  accent: "var(--color-focus)",
  ...Object.fromEntries(CHART_COLORS.map((value, index) => [`chart${index + 1}`, value])),
};

const BACKGROUND: Record<string, string> = {
  ink: "var(--color-text)",
  muted: "color-mix(in srgb, var(--color-text-dim) 22%, transparent)",
  faint: "color-mix(in srgb, var(--color-text-dim) 12%, transparent)",
  canvas: "var(--color-bg)",
  surface: "color-mix(in srgb, var(--color-text) 5%, transparent)",
  "surface-strong": "color-mix(in srgb, var(--color-text) 9%, transparent)",
  border: "color-mix(in srgb, var(--color-text) 10%, transparent)",
  info: "color-mix(in srgb, #60a5fa 16%, transparent)",
  success: "color-mix(in srgb, #34d399 16%, transparent)",
  warning: "color-mix(in srgb, #fbbf24 16%, transparent)",
  danger: "color-mix(in srgb, #f87171 16%, transparent)",
  accent: "color-mix(in srgb, var(--color-accent) 26%, transparent)",
  ...Object.fromEntries(CHART_COLORS.map((value, index) => [`chart${index + 1}`, `color-mix(in srgb, ${value} 22%, transparent)`])),
};

const cssValue = (value: unknown) =>
  typeof value === "string" && value.trim() && isSafeCss(value) ? value.trim() : undefined;

/** Text, icon and stroke colors: a token or a CSS color. */
export const fg = (value: unknown) =>
  typeof value === "string" ? (FOREGROUND[value] ?? cssValue(value)) : undefined;

/** Backgrounds: status tokens become soft tints. */
export const bg = (value: unknown) =>
  typeof value === "string" ? (BACKGROUND[value] ?? cssValue(value)) : undefined;

/**
 * Shape fills: tokens become tints that sit on any surface (a drawing board, a
 * card, a tinted box) instead of the opaque text colors a stroke needs.
 */
const SHAPE_FILL: Record<string, string> = {
  ink: "var(--color-text)",
  muted: "color-mix(in srgb, var(--color-text-dim) 70%, transparent)",
  faint: "color-mix(in srgb, var(--color-text-dim) 40%, transparent)",
  canvas: "var(--color-bg)",
  surface: "color-mix(in srgb, var(--color-text) 9%, transparent)",
  border: "color-mix(in srgb, var(--color-text) 16%, transparent)",
  info: "color-mix(in srgb, #60a5fa 26%, transparent)",
  success: "color-mix(in srgb, #34d399 26%, transparent)",
  warning: "color-mix(in srgb, #fbbf24 26%, transparent)",
  danger: "color-mix(in srgb, #f87171 26%, transparent)",
  accent: "color-mix(in srgb, var(--color-accent) 34%, transparent)",
  ...Object.fromEntries(CHART_COLORS.map((value, index) => [`chart${index + 1}`, `color-mix(in srgb, ${value} 28%, transparent)`])),
};

export const fillColor = (value: unknown) =>
  typeof value === "string" ? (SHAPE_FILL[value] ?? cssValue(value)) : undefined;

/**
 * Text color for a model-chosen raw color background. Raw colors do not follow
 * the theme, so the text is set dark or light to stay legible.
 */
function contrastOn(background: unknown): string | undefined {
  if (typeof background !== "string" || background in BACKGROUND) return undefined;
  let rgb: number[] | null = null;
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(background.trim());
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
    rgb = [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
  } else {
    const match = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(background.trim());
    if (match) rgb = [match[1], match[2], match[3]].map(Number);
  }
  if (!rgb) return undefined;
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.36 ? "#101010" : "#f5f5f5";
}

/** Style for content on a raw-color background: text tokens switch to the readable color. */
export function onColor(background: unknown): CSSProperties {
  const ink = contrastOn(background);
  if (!ink) return {};
  return {
    color: ink,
    "--color-text": ink,
    "--color-text-dim": `color-mix(in srgb, ${ink} 72%, transparent)`,
  } as CSSProperties;
}

/** Spacing in 4px steps. */
export const space = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? `${Math.max(0, value) * 4}px` : undefined;

export function size(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return `${Math.max(0, value)}px`;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}px`;
  return /^\d+(\.\d+)?(px|%|em|rem|vh|vw|fr)$|^auto$/.test(trimmed) ? trimmed : undefined;
}

const RADIUS: Record<string, string> = {
  sm: "6px",
  md: "9px",
  lg: "12px",
  xl: "16px",
  full: "999px",
};
export const radius = (value: unknown) => (typeof value === "string" ? RADIUS[value] : size(value));

export const cx = (...names: (string | false | null | undefined)[]) =>
  names.filter(Boolean).join(" ") || undefined;

/** A short plain-text name for an element, from its rendered text, for action messages. */
export const textOf = (element: HTMLElement | null) =>
  (element?.innerText ?? "").replace(/\s+/g, " ").trim().slice(0, 120);

/** Number formatting shared by charts, sliders and tables. */
export const numberText = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
};
