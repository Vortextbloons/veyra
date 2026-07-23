import type { ProviderToolDefinition, ProviderToolCall } from "@/lib/providers/types";
import type { StudioValidationIssue } from "./studio-types";

export const STUDIO_RENDER_TOOL_NAME = "studio_render";
export const STUDIO_TITLE_MAX_CHARS = 120;
export const STUDIO_HTML_MAX_BYTES = 250 * 1024;
export const STUDIO_CSS_MAX_BYTES = 150 * 1024;
export const STUDIO_TOTAL_MAX_BYTES = 400 * 1024;
export const STUDIO_CAPTION_MAX_CHARS = 280;

export const STUDIO_RENDER_TOOL: ProviderToolDefinition = {
  type: "function",
  function: {
    name: STUDIO_RENDER_TOOL_NAME,
    description: "Present the complete central workspace in Veyra Studio. Each call is a full-stage replacement. Scripts and remote resources are forbidden.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Artifact title (1-120 characters)." },
        html: { type: "string", description: "Complete body fragment; not a full HTML document." },
        css: { type: "string", description: "Complete stylesheet. Do not use URLs or imports." },
        caption: { type: "string", description: "Optional host-rendered explanation (maximum 280 characters)." },
        transition: { type: "string", enum: ["none", "fade", "dissolve", "slide"], description: "Optional host-controlled transition hint." },
      },
      required: ["title", "html", "css"],
      additionalProperties: false,
    },
  },
};

export function parseStudioArguments(call: ProviderToolCall):
  | { ok: true; value: { title: string; html: string; css: string; caption?: string; transition?: "none" | "fade" | "dissolve" | "slide" } }
  | { ok: false; issues: StudioValidationIssue[] } {
  const args = call.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, issues: [{ code: "invalid_arguments", message: "Arguments must be an object." }] };
  const record = args as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["title", "html", "css", "caption", "transition"].includes(key)) ||
      typeof record.title !== "string" || typeof record.html !== "string" || typeof record.css !== "string") {
    return { ok: false, issues: [{ code: "invalid_arguments", message: "Title, html, and css strings plus optional caption and transition are accepted." }] };
  }
  const title = record.title.trim();
  const bytes = new TextEncoder();
  if (!title || [...title].length > STUDIO_TITLE_MAX_CHARS) return { ok: false, issues: [{ code: "invalid_title", message: "Title must contain 1-120 characters." }] };
  if (!record.html.trim()) return { ok: false, issues: [{ code: "empty_html", message: "HTML must not be empty." }] };
  const htmlBytes = bytes.encode(record.html).byteLength;
  const cssBytes = bytes.encode(record.css).byteLength;
  if (htmlBytes > STUDIO_HTML_MAX_BYTES) return { ok: false, issues: [{ code: "html_too_large", message: "HTML exceeds 250 KB." }] };
  if (cssBytes > STUDIO_CSS_MAX_BYTES) return { ok: false, issues: [{ code: "css_too_large", message: "CSS exceeds 150 KB." }] };
  if (htmlBytes + cssBytes > STUDIO_TOTAL_MAX_BYTES) return { ok: false, issues: [{ code: "artifact_too_large", message: "Artifact exceeds 400 KB." }] };
  if (record.caption !== undefined && (typeof record.caption !== "string" || [...record.caption].length > STUDIO_CAPTION_MAX_CHARS)) return { ok: false, issues: [{ code: "invalid_caption", message: "Caption must contain at most 280 characters." }] };
  if (record.transition !== undefined && !["none", "fade", "dissolve", "slide"].includes(String(record.transition))) return { ok: false, issues: [{ code: "invalid_transition", message: "Transition must be none, fade, dissolve, or slide." }] };
  return { ok: true, value: { title, html: record.html, css: record.css, caption: typeof record.caption === "string" ? record.caption.trim() || undefined : undefined, transition: record.transition as "none" | "fade" | "dissolve" | "slide" | undefined } };
}
