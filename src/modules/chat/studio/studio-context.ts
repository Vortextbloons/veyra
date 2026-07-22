import type { StudioArtifact } from "./studio-types";

export const STUDIO_SYSTEM_INSTRUCTION =
  "Studio presentation is enabled. Use studio_render when a visual interface would improve the response. Return a complete HTML body fragment and CSS. Do not access Veyra, Tauri, the filesystem, credentials, scripts, or remote resources.";

const REVISION_HINT =
  /\b(studio|artifact|canvas|dashboard|timeline|visual|layout|restyle|redesign|revise|update the (view|ui|interface|artifact)|regenerate|make it (look|feel)|change the (colors|design|style))\b/i;

export function shouldIncludeStudioArtifactContext(userPrompt: string): boolean {
  return REVISION_HINT.test(userPrompt.trim());
}

function truncateUtf8(value: string, maxBytes: number): string {
  const bytes = new TextEncoder().encode(value);
  if (bytes.byteLength <= maxBytes) return value;
  let end = value.length;
  while (end > 0 && new TextEncoder().encode(value.slice(0, end)).byteLength > maxBytes) {
    end -= 1;
  }
  return `${value.slice(0, end)}\n<!-- truncated -->`;
}

export function buildStudioArtifactContextBlock(
  artifact: StudioArtifact,
  maxBytes = 12_000,
): string | undefined {
  const revision = artifact.revisions.find((item) => item.revision === artifact.currentRevision);
  if (!revision) return undefined;

  const header = `Current Studio artifact "${revision.title}" (revision ${revision.revision}). Return a complete replacement via studio_render.`;
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header).byteLength;
  const remaining = Math.max(512, maxBytes - headerBytes - 32);
  const htmlBudget = Math.floor(remaining * 0.65);
  const cssBudget = remaining - htmlBudget;
  const html = truncateUtf8(revision.html, htmlBudget);
  const css = truncateUtf8(revision.css, cssBudget);
  const block = `${header}\n\nHTML:\n${html}\n\nCSS:\n${css}`;
  if (encoder.encode(block).byteLength > maxBytes) {
    return `${header}\n\nThe current artifact is too large to include in full. Regenerate from the user's request and this summary only.`;
  }
  return block;
}
