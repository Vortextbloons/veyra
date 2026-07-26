const CSP = "default-src 'none'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; media-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'; worker-src 'none'; manifest-src 'none'; style-src 'unsafe-inline'";

function escapeHtml(value: string): string {
  const escapes: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  return value.replace(/[&<>"]/g, (character) => escapes[character] ?? character);
}

export function buildStudioDocument(input: { title: string; html: string; css: string; javascript?: string; reducedMotion?: boolean }): string {
  const reducedMotion = input.reducedMotion ? "@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:.001ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.001ms!important}}" : "";
  const base = "html,body{min-height:100%;background:transparent;color:#f4f4f5}*{box-sizing:border-box}body{margin:0;overflow:auto}";
  const javascript = input.javascript?.replace(/<\/script/gi, "<\\/script");
  const script = javascript?.trim() ? `<script>"use strict";\n${javascript}</script>` : "";
  const bridge = `(()=>{const send=()=>parent.postMessage({type:"veyra-studio-size",height:Math.ceil(Math.max(document.body.scrollHeight,document.documentElement.scrollHeight))},"*");addEventListener("load",send);if("ResizeObserver" in window)new ResizeObserver(send).observe(document.body);send()})();`;
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.title)}</title><style>${base}${input.css}\n${reducedMotion}</style></head><body>${input.html}${script}<script>${bridge}</script></body></html>`;
}
