import type { ChatMessage } from "@/modules/chat/chat-types";
import type {
  StudioTheme,
  StudioThemeEffect,
  StudioThemeFont,
  StudioThemeRequest,
  StudioThemeStyles,
  StudioValidationIssue,
} from "./studio-types";

const THEME_KEYS = new Set([
  "name",
  "background",
  "surface",
  "panel",
  "composer",
  "text",
  "muted",
  "accent",
  "border",
  "font",
  "effect",
  "styles",
]);
const HEX_COLOR = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;
const FONTS: ReadonlySet<StudioThemeFont> = new Set(["system", "mono", "serif", "rounded"]);
const EFFECTS: ReadonlySet<StudioThemeEffect> = new Set(["none", "glow", "grid", "scanlines"]);
const STYLE_REGIONS = new Set(["window", "header", "messages", "assistantMessage", "userMessage", "composer"]);
const MAX_STYLE_REGION_CHARS = 2_000;

export function parseStudioThemeStyles(raw: unknown):
  | { ok: true; value: StudioThemeStyles }
  | { ok: false; issues: StudioValidationIssue[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, issues: [{ code: "invalid_theme_styles", message: "Theme styles must be an object of declaration strings." }] };
  }
  const record = raw as Record<string, unknown>;
  if (Object.keys(record).some((key) => !STYLE_REGIONS.has(key))) {
    return { ok: false, issues: [{ code: "invalid_theme_styles", message: "Theme styles contain an unsupported region." }] };
  }
  const value: StudioThemeStyles = {};
  for (const [region, declarations] of Object.entries(record)) {
    if (typeof declarations !== "string" || declarations.length > MAX_STYLE_REGION_CHARS) {
      return { ok: false, issues: [{ code: "invalid_theme_styles", message: `${region} styles must be a declaration string under 2,000 characters.` }] };
    }
    if (/[{}<>]|@|url\s*\(|expression\s*\(|javascript\s*:|-moz-binding|behavior\s*:|position\s*:\s*(?:fixed|absolute)|display\s*:\s*none|visibility\s*:\s*hidden|pointer-events\s*:\s*none/i.test(declarations)) {
      return { ok: false, issues: [{ code: "unsafe_theme_styles", message: `${region} styles contain a blocked construct.` }] };
    }
    value[region as keyof StudioThemeStyles] = declarations.trim();
  }
  return { ok: true, value };
}

function withAlpha(color: string, alpha: string): string {
  return color.length === 7 ? `${color}${alpha}` : color;
}

export function parseStudioTheme(raw: unknown):
  | { ok: true; value: StudioTheme }
  | { ok: false; issues: StudioValidationIssue[] } {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, issues: [{ code: "invalid_theme", message: "Theme must be an object." }] };
  }
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).some((key) => !THEME_KEYS.has(key))) {
    return { ok: false, issues: [{ code: "invalid_theme", message: "Theme contains an unsupported field." }] };
  }
  const required = ["name", "background", "panel", "text", "accent"] as const;
  if (required.some((key) => typeof value[key] !== "string")) {
    return { ok: false, issues: [{ code: "invalid_theme", message: "Theme requires name, background, panel, text, and accent strings." }] };
  }
  const name = (value.name as string).trim();
  if (!name || [...name].length > 48) {
    return { ok: false, issues: [{ code: "invalid_theme_name", message: "Theme name must contain 1-48 characters." }] };
  }
  const colorKeys = ["background", "surface", "panel", "composer", "text", "muted", "accent", "border"] as const;
  for (const key of colorKeys) {
    if (value[key] !== undefined && (typeof value[key] !== "string" || !HEX_COLOR.test(value[key] as string))) {
      return { ok: false, issues: [{ code: "invalid_theme_color", message: `${key} must be a 6- or 8-digit hex color.` }] };
    }
  }
  const font = value.font ?? "system";
  const effect = value.effect ?? "none";
  if (typeof font !== "string" || !FONTS.has(font as StudioThemeFont)) {
    return { ok: false, issues: [{ code: "invalid_theme_font", message: "Theme font is unsupported." }] };
  }
  if (typeof effect !== "string" || !EFFECTS.has(effect as StudioThemeEffect)) {
    return { ok: false, issues: [{ code: "invalid_theme_effect", message: "Theme effect is unsupported." }] };
  }
  const parsedStyles = value.styles === undefined ? undefined : parseStudioThemeStyles(value.styles);
  if (parsedStyles && !parsedStyles.ok) return parsedStyles;
  const panel = value.panel as string;
  const text = value.text as string;
  const accent = value.accent as string;
  return {
    ok: true,
    value: {
      name,
      background: value.background as string,
      surface: (value.surface as string | undefined) ?? panel,
      panel,
      composer: (value.composer as string | undefined) ?? panel,
      text,
      muted: (value.muted as string | undefined) ?? withAlpha(text, "a8"),
      accent,
      border: (value.border as string | undefined) ?? withAlpha(accent, "55"),
      font: font as StudioThemeFont,
      effect: effect as StudioThemeEffect,
      styles: parsedStyles?.value,
    },
  };
}

export function normalizeStudioTheme(raw: unknown): StudioTheme | undefined {
  const parsed = parseStudioTheme(raw);
  return parsed.ok ? parsed.value : undefined;
}

type ThemeSeed = Omit<StudioTheme, "name">;

const THEME_PRESETS: Array<{ pattern: RegExp; theme: ThemeSeed }> = [
  {
    pattern: /hacker|terminal|matrix|cyber|code|console/i,
    theme: { background: "#020805", surface: "#06110a", panel: "#08170e", composer: "#06130b", text: "#c4ffd4", muted: "#78b98a", accent: "#35ff72", border: "#1d6b38", font: "mono", effect: "scanlines" },
  },
  {
    pattern: /synth|neon|retro|arcade|vapor|nightclub/i,
    theme: { background: "#0b0718", surface: "#140d27", panel: "#1a1132", composer: "#160e2c", text: "#f8edff", muted: "#b9a5ca", accent: "#ff4fd8", border: "#713c82", font: "rounded", effect: "glow" },
  },
  {
    pattern: /paper|editorial|book|library|literary|newspaper/i,
    theme: { background: "#e9e2d4", surface: "#f3ecdf", panel: "#fbf6ec", composer: "#f6efe3", text: "#29231d", muted: "#70665c", accent: "#9b3f2d", border: "#c8baaa", font: "serif", effect: "none" },
  },
  {
    pattern: /ocean|marine|coast|water|aqua|ice/i,
    theme: { background: "#06131b", surface: "#0b202b", panel: "#0d2936", composer: "#0a222e", text: "#e1f8ff", muted: "#8eb8c7", accent: "#49d7e8", border: "#256072", font: "system", effect: "glow" },
  },
  {
    pattern: /forest|nature|botanical|moss|garden|earth/i,
    theme: { background: "#09120e", surface: "#101e17", panel: "#14251b", composer: "#102017", text: "#edf6e9", muted: "#9eb29a", accent: "#91c56e", border: "#405c3b", font: "rounded", effect: "grid" },
  },
  {
    pattern: /ember|fire|forge|warm|autumn|copper/i,
    theme: { background: "#160b08", surface: "#25120d", panel: "#301811", composer: "#29140f", text: "#fff1e6", muted: "#c7a18e", accent: "#ff824d", border: "#75412f", font: "serif", effect: "glow" },
  },
];

function hashVibe(value: string): number {
  let hash = 2166136261;
  for (const character of value) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return hash >>> 0;
}

function hslToHex(hue: number, saturation: number, lightness: number): string {
  const s = saturation / 100;
  const l = lightness / 100;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const section = hue / 60;
  const x = chroma * (1 - Math.abs((section % 2) - 1));
  const [red, green, blue] = section < 1 ? [chroma, x, 0]
    : section < 2 ? [x, chroma, 0]
      : section < 3 ? [0, chroma, x]
        : section < 4 ? [0, x, chroma]
          : section < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const offset = l - chroma / 2;
  return `#${[red, green, blue].map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, "0")).join("")}`;
}

function deriveFallbackTheme(vibe: string): ThemeSeed {
  const hash = hashVibe(vibe);
  const hue = hash % 360;
  const fonts = ["system", "rounded", "serif", "mono"] as const;
  const effects = ["glow", "grid", "none"] as const;
  return {
    background: hslToHex(hue, 28, 6),
    surface: hslToHex(hue, 26, 10),
    panel: hslToHex(hue, 25, 13),
    composer: hslToHex(hue, 26, 11),
    text: hslToHex(hue, 24, 94),
    muted: hslToHex(hue, 18, 68),
    accent: hslToHex(hue, 76, 68),
    border: hslToHex(hue, 30, 29),
    font: fonts[(hash >>> 4) % fonts.length]!,
    effect: effects[(hash >>> 7) % effects.length]!,
  };
}

function displayName(vibe: string): string {
  return vibe.trim().split(/\s+/).slice(0, 4).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

/** Converts a short creative direction into a complete deterministic theme. */
export function deriveStudioTheme(request: StudioThemeRequest): StudioTheme | null {
  const vibe = request.vibe.trim();
  if (/^(default|reset|veyra|system)$/i.test(vibe)) return null;
  const preset = THEME_PRESETS.find((candidate) => candidate.pattern.test(vibe))?.theme
    ?? deriveFallbackTheme(vibe);
  const effect = request.effect
    ?? (request.intensity === "subtle"
      ? "none"
      : request.intensity === "bold" && preset.effect === "none"
        ? "grid"
        : preset.effect);
  return {
    ...preset,
    name: displayName(vibe),
    accent: request.accent ?? preset.accent,
    border: request.accent
      ? withAlpha(request.accent, request.intensity === "bold" ? "88" : "55")
      : request.intensity === "bold"
        ? withAlpha(preset.accent, "88")
        : preset.border,
    effect,
    ...(request.font ? { font: request.font } : {}),
    ...request.palette,
    ...(request.styles ? { styles: request.styles } : {}),
  };
}

/** Latest selected Studio revision with a theme; unthemed turns preserve it. */
export function findLatestStudioTheme(messages: ChatMessage[]): StudioTheme | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message) continue;
    if (Object.prototype.hasOwnProperty.call(message, "studioTheme")) {
      return message.studioTheme ?? undefined;
    }
    const response = message.studioResponse;
    if (!response) continue;
    const revision = response.revisions.find((item) => item.revision === response.currentRevision);
    if (revision?.theme) return revision.theme;
  }
  return undefined;
}

const FONT_STACKS: Record<StudioThemeFont, string> = {
  system: "var(--font-sans)",
  mono: "var(--font-mono)",
  serif: "Georgia, 'Times New Roman', serif",
  rounded: "Sora, var(--font-sans)",
};

export function studioThemeCssVariables(theme: StudioTheme): Record<string, string> {
  return {
    "--color-bg": theme.background,
    "--color-surface": theme.surface,
    "--color-panel": theme.panel,
    "--color-border": theme.border,
    "--color-border-strong": theme.accent,
    "--color-text": theme.text,
    "--color-text-dim": theme.muted,
    "--color-muted": theme.muted,
    "--color-accent": theme.accent,
    "--color-accent-soft": withAlpha(theme.accent, "24"),
    "--color-focus": theme.accent,
    "--color-white": theme.text,
    "--studio-surface": theme.surface,
    "--studio-panel": theme.panel,
    "--studio-font-family": FONT_STACKS[theme.font],
  };
}

const REGION_SELECTORS: Record<keyof StudioThemeStyles, string> = {
  window: ".studio-themed-chat",
  header: ".studio-themed-chat .studio-theme-header",
  messages: ".studio-themed-chat .studio-theme-messages",
  assistantMessage: ".studio-themed-chat .studio-theme-assistant-message",
  userMessage: ".studio-themed-chat .studio-theme-user-message",
  composer: ".studio-themed-chat .studio-theme-composer",
};

export function studioThemeScopedCss(theme: StudioTheme): string | undefined {
  if (!theme.styles) return undefined;
  const rules = Object.entries(theme.styles)
    .filter((entry): entry is [keyof StudioThemeStyles, string] => Boolean(entry[1]))
    .map(([region, declarations]) => `${REGION_SELECTORS[region]} { ${declarations} }`);
  return rules.length ? rules.join("\n") : undefined;
}
