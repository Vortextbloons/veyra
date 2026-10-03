import type { ProviderToolCall, ProviderToolDefinition } from "@/lib/providers/types";
import type { StudioEnvironmentEntry } from "./studio-environment";
import { parseStudioArguments, STUDIO_HTML_MAX_BYTES } from "./studio-tool";

export const STUDIO_UPDATE_TOOL_NAME = "studio_update";
export const STUDIO_UPDATE_TOOL: ProviderToolDefinition = {
  type: "function",
  function: {
    name: STUDIO_UPDATE_TOOL_NAME,
    description: "Update one named region of the active Studio environment while retaining everything else. Regions are marked data-studio-region in HTML. Supply the exact base key from current environment context. Changes create a recoverable version. Optional css/javascript replace the whole stylesheet/script; omit to preserve them. Omitted data preserves existing facts.",
    parameters: {
      type: "object",
      properties: {
        base: { type: "string", description: "Exact current environment key provided in context." },
        region: { type: "string", description: "Existing data-studio-region name (letters, numbers, underscore, hyphen)." },
        html: { type: "string", description: "New inner HTML for that region." },
        css: { type: "string", description: "Optional complete replacement stylesheet." },
        javascript: { type: "string", description: "Optional complete replacement interaction script." },
        title: { type: "string" },
        summary: { type: "string", description: "Brief explanation of the change." },
        data: { type: "object", description: "Optional replacement JSON facts." },
      },
      required: ["base", "region", "html"],
      additionalProperties: false,
    },
  },
};

export function parseStudioUpdateArguments(call: ProviderToolCall, entry?: StudioEnvironmentEntry): ReturnType<typeof parseStudioArguments> {
  const args = call.arguments as Record<string, unknown>;
  const fail = (code: string, message: string): ReturnType<typeof parseStudioArguments> => ({ ok: false, issues: [{ code, message }] });
  if (!args || typeof args !== "object" || Array.isArray(args) || Object.keys(args).some((key) => !["base", "region", "html", "css", "javascript", "title", "summary", "data"].includes(key))) return fail("invalid_arguments", "Use only base, region, html, and optional title, css, javascript, summary, data.");
  if (!entry || args.base !== entry.key) return fail("stale_environment", "The base no longer matches the active environment. Request a complete replacement with studio_render instead.");
  if (typeof args.region !== "string" || !/^[\w-]{1,80}$/.test(args.region) || typeof args.html !== "string") return fail("invalid_region", "Supply a named region and an HTML string.");
  if (new TextEncoder().encode(args.html).byteLength > STUDIO_HTML_MAX_BYTES) return fail("html_too_large", "Region HTML exceeds 250 KB.");
  if (typeof DOMParser === "undefined") return fail("parser_unavailable", "The HTML parser is unavailable.");
  const document = new DOMParser().parseFromString(entry.revision.html, "text/html");
  const regions = Array.from(document.querySelectorAll("[data-studio-region]")).filter((element) => element.getAttribute("data-studio-region") === args.region);
  if (regions.length !== 1) return fail("missing_region", "The region must exist exactly once. Use studio_render to change the whole environment.");
  const region = regions[0];
  if (!region) return fail("missing_region", "The region is unavailable.");
  region.innerHTML = args.html;
  return parseStudioArguments({ ...call, arguments: {
    title: args.title ?? entry.revision.title,
    html: document.body.innerHTML,
    css: args.css ?? entry.revision.css,
    javascript: args.javascript ?? entry.revision.javascript,
    summary: args.summary ?? entry.revision.summary,
    data: args.data ?? entry.revision.data,
  } });
}
