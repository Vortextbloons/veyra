import type { ChatMessage } from "@/modules/chat/chat-types";
import type { StudioContextMode, StudioResponse, StudioScene } from "./studio-types";
import { findLatestStudioTheme } from "./studio-theme";

/** Returns a domain-specific Studio system instruction. */
export function getStudioSystemInstruction(mode: StudioContextMode = "chat"): string {
  const base =
    "This is Studio: an immersive back-and-forth conversation where each assistant turn may have its own visual voice. Always answer conversationally and begin with useful text; polished Markdown, tables, callouts, and distinctive formatting are welcome. Most turns need no tool. Call studio_render only when a bespoke diagram, layout, simulation, or interaction makes this answer materially better; it creates the custom body of this message, not a separate website. Call studio_theme at most once per assistant turn, when changing the atmosphere of the transcript and composer would help or when the user asks for a theme. A short vibe is enough for simple styling. When a distinctive art direction matters, freely author the optional palette, font, and scoped declaration blocks for the window, header, transcript, assistant messages, user messages, and composer. Declaration blocks contain CSS declarations only, without selectors or braces. Use vibe 'default' to reset. You may call studio_theme without studio_render. Studio JavaScript is optional, self-contained, and runs in an isolated networkless frame without external libraries or host APIs. Keep custom messages responsive, readable, keyboard accessible, and reduced-motion safe. Studio cannot control Veyra navigation, permissions, files, credentials, tools, or host state.";
  const modeHints: Record<StudioContextMode, string> = {
    chat: base,
    character: `${base}\nBuild character-appropriate visual scenes such as settings, character displays, mood boards, or interactive dialogues that reflect the character's persona and world.`,
    research: `${base}\nBuild evidence interfaces such as source comparison tables, evidence dashboards, claim maps, timeline visualizations, or research summaries.`,
    project: `${base}\nBuild project command centers such as milestone trackers, task boards, status dashboards, or planning views that reflect the current project context.`,
    document: `${base}\nBuild document presentations such as formatted readers, visual outlines, comparison views, or annotated layouts that help explore the document content.`,
  };
  return modeHints[mode] ?? base;
}

const REVISION_HINT =
  /\b(studio|artifact|canvas|dashboard|timeline|visual|layout|restyle|redesign|revise|update the (view|ui|interface|artifact)|regenerate|make it (look|feel)|change the (colors|design|style))\b/i;

export function shouldIncludeStudioResponseContext(userPrompt: string): boolean {
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

/** Infers the Studio context mode from conversation properties and chat mode. */
export function inferStudioContextMode(conversation?: {
  characterId?: string | null;
  groupId?: string | null;
  projectId?: string | null;
  mode?: string;
}): StudioContextMode {
  if (conversation?.characterId || conversation?.groupId) return "character";
  if (conversation?.projectId) return "project";
  if (conversation?.mode === "research") return "research";
  return "chat";
}

/** Builds mode-specific context data to include alongside the response. */
export function buildModeContextBlock(
  mode: StudioContextMode,
  domainData?: { persona?: string; scenario?: string; loreEntries?: string; projectName?: string; projectKind?: string; projectDescription?: string; documentTitle?: string; documentType?: string },
): string | undefined {
  if (mode === "chat") return undefined;
  const parts: string[] = [];
  if (mode === "character" && domainData) {
    if (domainData.persona) parts.push(`Character persona: ${domainData.persona}`);
    if (domainData.scenario) parts.push(`Scenario: ${domainData.scenario}`);
    if (domainData.loreEntries) parts.push(`World lore: ${domainData.loreEntries}`);
  }
  if (mode === "project" && domainData) {
    if (domainData.projectName) parts.push(`Project: ${domainData.projectName}`);
    if (domainData.projectKind) parts.push(`Project kind: ${domainData.projectKind}`);
    if (domainData.projectDescription) parts.push(`Description: ${domainData.projectDescription}`);
  }
  if (mode === "document" && domainData) {
    if (domainData.documentTitle) parts.push(`Document: ${domainData.documentTitle}`);
    if (domainData.documentType) parts.push(`Document type: ${domainData.documentType}`);
  }
  if (mode === "research") {
    parts.push("Use available research sources and evidence to build informative visual interfaces.");
  }
  return parts.length > 0 ? `<veyra_context mode="${mode}">\n${parts.join("\n")}\n</veyra_context>` : undefined;
}

function buildStudioSourceContextBlock(input: {
  title: string;
  revision: number;
  html: string;
  css: string;
  javascript?: string;
  theme?: import("./studio-types").StudioTheme;
  label?: string;
}, maxBytes = 12_000): string | undefined {
  const label = input.label ?? "Studio response";
  const header = `Current ${label} "${input.title}" (revision ${input.revision}). Return a complete replacement via studio_render.`;
  const encoder = new TextEncoder();
  const headerBytes = encoder.encode(header).byteLength;
  const remaining = Math.max(512, maxBytes - headerBytes - 32);
  const hasJavascript = Boolean(input.javascript?.trim());
  const htmlBudget = Math.floor(remaining * (hasJavascript ? 0.52 : 0.65));
  const cssBudget = Math.floor(remaining * (hasJavascript ? 0.28 : 0.35));
  const javascriptBudget = remaining - htmlBudget - cssBudget;
  const html = truncateUtf8(input.html, htmlBudget);
  const css = truncateUtf8(input.css, cssBudget);
  const javascript = hasJavascript ? truncateUtf8(input.javascript ?? "", javascriptBudget) : undefined;
  const theme = input.theme ? `\n\nChat theme:\n${JSON.stringify(input.theme)}` : "";
  const block = `${header}\n\nHTML:\n${html}\n\nCSS:\n${css}${javascript ? `\n\nJavaScript:\n${javascript}` : ""}${theme}`;
  if (encoder.encode(block).byteLength > maxBytes) {
    return `${header}\n\nThe current response is too large to include in full. Regenerate from the user's request and this summary only.`;
  }
  return block;
}

export function buildStudioSceneContextBlock(scene: StudioScene, maxBytes = 12_000): string | undefined {
  return buildStudioSourceContextBlock({ title: scene.title, revision: scene.revision, html: scene.html, css: scene.css, javascript: scene.javascript, label: "Studio scene" }, maxBytes);
}

export function buildStudioResponseContextBlock(response: StudioResponse, maxBytes = 12_000): string | undefined {
  const revision = response.revisions.find((item) => item.revision === response.currentRevision);
  return revision ? buildStudioSourceContextBlock({ ...revision, label: "Studio response" }, maxBytes) : undefined;
}

/** Most recent ready Studio assistant response in transcript order. */
export function findLatestReadyStudioResponse(messages: ChatMessage[]): StudioResponse | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") continue;
    const response = message.studioResponse;
    if (response?.status === "ready" && response.revisions.length > 0) {
      return response;
    }
  }
  return undefined;
}

export function buildStudioThemeContextBlock(messages: ChatMessage[]): string | undefined {
  const theme = findLatestStudioTheme(messages);
  if (!theme) return undefined;
  return `Current Studio chat theme: ${theme.name} (font ${theme.font}, effect ${theme.effect}, accent ${theme.accent}). Use studio_theme with a short revised vibe to adjust it, or vibe "default" to reset.`;
}
