const CSP = "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; manifest-src 'none'; style-src 'unsafe-inline'";
import { STUDIO_BRIDGE_SOURCE } from "./studio-bridge";
import type { StudioJsonObject } from "./studio-types";

function safeJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function escapeHtml(value: string): string {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return value.replace(/[&<>"]/g, (character) => escapes[character] ?? character);
}

export function buildStudioDocument(input: { title: string; html: string; css: string; javascript?: string; data?: StudioJsonObject; state?: StudioJsonObject; channel?: string; reducedMotion?: boolean }): string {
  const reducedMotion = input.reducedMotion ? "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}" : "";
  const base = "html,body{min-height:100%;background:transparent;color:#f4f4f5}*{box-sizing:border-box}body{margin:0;overflow:auto}";
  const javascript = input.javascript?.replace(/<\/script/gi, "<\\/script");
  const script = javascript?.trim() ? `<script>studio.ready(function(){"use strict";\n${javascript}\n});</script>` : "";
  const config = safeJson({ channel: input.channel ?? "", data: input.data ?? {}, state: input.state ?? {} });
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><style>${base}${input.css}\n${reducedMotion}</style></head><body>${input.html}<script>window.__veyraStudioConfig=${config};${STUDIO_BRIDGE_SOURCE}</script>${script}</body></html>`;
}
