import type { ProviderToolDefinition, ProviderToolCall } from "@/lib/providers/types";
import type { StudioValidationIssue } from "./studio-types";

export const STUDIO_RENDER_TOOL_NAME = "studio_render";
export const STUDIO_TITLE_MAX_CHARS = 120;
export const STUDIO_HTML_MAX_BYTES = 250 * 1024;
export const STUDIO_CSS_MAX_BYTES = 150 * 1024;
export const STUDIO_TOTAL_MAX_BYTES = 400 * 1024;

export const STUDIO_RENDER_TOOL: ProviderToolDefinition = {
  type: "function",
  function: {
    name: STUDIO_RENDER_TOOL_NAME,
    description: "Render a complete visual artifact in Veyra Studio. Return semantic HTML body content and CSS only. Scripts and all remote resources are forbidden. Each call fully replaces the artifact.",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "Artifact title (1-120 characters)." },
        html: { type: "string", description: "Complete body fragment; not a full HTML document." },
        css: { type: "string", description: "Complete stylesheet. Do not use URLs or imports." },
      },
      required: ["title", "html", "css"],
      additionalProperties: false,
    },
  },
};

export function parseStudioArguments(call: ProviderToolCall):
  | { ok: true; value: { title: string; html: string; css: string } }
  | { ok: false; issues: StudioValidationIssue[] } {
  const args = call.arguments;
  if (!args || typeof args !== "object" || Array.isArray(args)) return { ok: false, issues: [{ code: "invalid_arguments", message: "Arguments must be an object." }] };
  const record = args as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["title", "html", "css"].includes(key)) ||
      typeof record.title !== "string" || typeof record.html !== "string" || typeof record.css !== "string") {
    return { ok: false, issues: [{ code: "invalid_arguments", message: "Exactly title, html, and css strings are required." }] };
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
  return { ok: true, value: { title, html: record.html, css: record.css } };
}

