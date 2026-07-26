import type { ProviderToolCall, ProviderToolDefinition } from "@/lib/providers/types";
import type { StudioThemeRequest, StudioValidationIssue } from "./studio-types";
import { parseStudioThemeStyles } from "./studio-theme";

export const STUDIO_THEME_TOOL_NAME = "studio_theme";
const THEME_VIBE_MAX_CHARS = 80;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export const STUDIO_THEME_TOOL: ProviderToolDefinition = {
  type: "function",
  function: {
    name: STUDIO_THEME_TOOL_NAME,
    description: "Restyle the Studio chat panel, messages, and composer. A short vibe is enough, but you may optionally author the complete palette, font, and scoped CSS declarations when a bespoke visual identity matters. Call this without studio_render when only the atmosphere should change. Use vibe 'default' to restore Veyra's theme.",
    parameters: {
      type: "object",
      properties: {
        vibe: {
          type: "string",
          description: "A short visual direction, such as 'hacker terminal', 'quiet editorial paper', or 'deep ocean'. Use 'default' to reset.",
        },
        intensity: {
          type: "string",
          enum: ["subtle", "balanced", "bold"],
          description: "Optional strength; balanced by default.",
        },
        accent: {
          type: "string",
          description: "Optional #RRGGBB accent override. Usually omit it and let Veyra derive the palette.",
        },
        effect: {
          type: "string",
          enum: ["none", "glow", "grid", "scanlines"],
          description: "Optional ambient effect override. Usually omit it.",
        },
        font: {
          type: "string",
          enum: ["system", "mono", "serif", "rounded"],
          description: "Optional typography override.",
        },
        palette: {
          type: "object",
          description: "Optional complete or partial custom palette. Omit to let Veyra derive it from vibe.",
          properties: Object.fromEntries(
            ["background", "surface", "panel", "composer", "text", "muted", "accent", "border"]
              .map((key) => [key, { type: "string", description: "A #RRGGBB or #RRGGBBAA color." }]),
          ),
          additionalProperties: false,
        },
        styles: {
          type: "object",
          description: "Optional CSS declaration blocks for fixed regions. Supply declarations only, without selectors or braces.",
          properties: {
            window: { type: "string", description: "Chat-window declarations, such as background, texture, or letter-spacing." },
            header: { type: "string", description: "Header declarations." },
            messages: { type: "string", description: "Transcript-area declarations." },
            assistantMessage: { type: "string", description: "Assistant-message container declarations." },
            userMessage: { type: "string", description: "User-message bubble declarations." },
            composer: { type: "string", description: "Composer-area declarations." },
          },
          additionalProperties: false,
        },
      },
      required: ["vibe"],
      additionalProperties: false,
    },
  },
};

export function parseStudioThemeArguments(call: ProviderToolCall):
  | { ok: true; value: StudioThemeRequest }
  | { ok: false; issues: StudioValidationIssue[] } {
  const args = call.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { ok: false, issues: [{ code: "invalid_theme_arguments", message: "Theme arguments must be an object." }] };
  }
  const record = args as Record<string, unknown>;
  const allowed = new Set(["vibe", "intensity", "accent", "effect", "font", "palette", "styles"]);
  if (Object.keys(record).some((key) => !allowed.has(key)) || typeof record.vibe !== "string") {
    return { ok: false, issues: [{ code: "invalid_theme_arguments", message: "Theme accepts vibe plus optional intensity, accent, and effect." }] };
  }
  const vibe = record.vibe.trim();
  if (!vibe || [...vibe].length > THEME_VIBE_MAX_CHARS) {
    return { ok: false, issues: [{ code: "invalid_theme_vibe", message: "Theme vibe must contain 1-80 characters." }] };
  }
  const intensity = record.intensity ?? "balanced";
  if (!(["subtle", "balanced", "bold"] as unknown[]).includes(intensity)) {
    return { ok: false, issues: [{ code: "invalid_theme_intensity", message: "Theme intensity is unsupported." }] };
  }
  if (record.accent !== undefined && (typeof record.accent !== "string" || !HEX_COLOR.test(record.accent))) {
    return { ok: false, issues: [{ code: "invalid_theme_accent", message: "Theme accent must be a 6-digit hex color." }] };
  }
  if (record.effect !== undefined && !(["none", "glow", "grid", "scanlines"] as unknown[]).includes(record.effect)) {
    return { ok: false, issues: [{ code: "invalid_theme_effect", message: "Theme effect is unsupported." }] };
  }
  if (record.font !== undefined && !(["system", "mono", "serif", "rounded"] as unknown[]).includes(record.font)) {
    return { ok: false, issues: [{ code: "invalid_theme_font", message: "Theme font is unsupported." }] };
  }
  let palette: StudioThemeRequest["palette"];
  if (record.palette !== undefined) {
    if (!record.palette || typeof record.palette !== "object" || Array.isArray(record.palette)) {
      return { ok: false, issues: [{ code: "invalid_theme_palette", message: "Theme palette must be an object." }] };
    }
    const paletteRecord = record.palette as Record<string, unknown>;
    const colorKeys = new Set(["background", "surface", "panel", "composer", "text", "muted", "accent", "border"]);
    if (Object.keys(paletteRecord).some((key) => !colorKeys.has(key)) || Object.values(paletteRecord).some((color) => typeof color !== "string" || !/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i.test(color))) {
      return { ok: false, issues: [{ code: "invalid_theme_palette", message: "Theme palette accepts only named 6- or 8-digit hex colors." }] };
    }
    palette = paletteRecord as StudioThemeRequest["palette"];
  }
  const parsedStyles = record.styles === undefined ? undefined : parseStudioThemeStyles(record.styles);
  if (parsedStyles && !parsedStyles.ok) return parsedStyles;
  return {
    ok: true,
    value: {
      vibe,
      intensity: intensity as StudioThemeRequest["intensity"],
      accent: record.accent as string | undefined,
      effect: record.effect as StudioThemeRequest["effect"],
      font: record.font as StudioThemeRequest["font"],
      palette,
      styles: parsedStyles?.value,
    },
  };
}
