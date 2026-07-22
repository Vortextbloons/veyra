const CSP = "default-src 'none'; script-src 'none'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; manifest-src 'none'; style-src 'unsafe-inline'";

function escapeHtml(value: string): string {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return value.replace(/[&<>"]/g, (character) => escapes[character] ?? character);
}

export function buildStudioDocument(input: { title: string; html: string; css: string; reducedMotion?: boolean }): string {
  const reducedMotion = input.reducedMotion ? "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}" : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><style>html{color-scheme:dark}*{box-sizing:border-box}body{margin:0;min-height:100vh;overflow:auto}${input.css}\n${reducedMotion}</style></head><body>${input.html}</body></html>`;
}
