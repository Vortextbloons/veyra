import type { StudioValidationIssue } from "./studio-types";

const BLOCKED_ELEMENTS = new Set(["script", "iframe", "frame", "frameset", "object", "embed", "base", "portal", "noscript", "meta", "link", "audio", "video", "source", "track"]);
const URL_ATTRIBUTES = new Set(["href", "src", "srcset", "poster", "action", "formaction", "cite", "background", "xlink:href"]);
const MAX_ELEMENTS = 5_000;
const MAX_DEPTH = 64;
const MAX_ATTRIBUTES = 20_000;

export function validateStudioArtifact(input: { html: string; css: string }):
  | { ok: true; html: string; css: string; elementCount: number }
  | { ok: false; issues: StudioValidationIssue[] } {
  const cssIssue = validateCss(input.css);
  if (cssIssue) return { ok: false, issues: [cssIssue] };
  if (typeof DOMParser === "undefined") return { ok: false, issues: [{ code: "parser_unavailable", message: "The HTML parser is unavailable." }] };
  const parser = new DOMParser();
  const document = parser.parseFromString(`<body>${input.html}</body>`, "text/html");
  const issues: StudioValidationIssue[] = [];
  let elements = 0;
  let attributes = 0;
  const visit = (element: Element, depth: number) => {
    elements += 1;
    attributes += element.attributes.length;
    const tag = element.tagName.toLowerCase();
    if (BLOCKED_ELEMENTS.has(tag)) issues.push({ code: "blocked_element", message: `<${tag}> is not allowed.` });
    if (tag === "style") issues.push({ code: "style_element", message: "Put all styles in the css field." });
    if (tag === "svg" && element.querySelector("animate, animateMotion, animateTransform, set")) issues.push({ code: "svg_animation", message: "SVG animation is not allowed." });
    for (const attr of Array.from(element.attributes)) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim();
      if (name.startsWith("on") || name === "srcdoc") issues.push({ code: "blocked_attribute", message: `${name} is not allowed.` });
      if (URL_ATTRIBUTES.has(name) && value && !(name === "href" && value.startsWith("#"))) issues.push({ code: "blocked_url", message: `${name} may only contain a same-document fragment.` });
      if ((name === "target" || name === "formtarget") && value) issues.push({ code: "blocked_navigation", message: `${name} is not allowed.` });
      if (name === "style" && /url\s*\(|@import|expression\s*\(|javascript\s*:/i.test(value)) issues.push({ code: "unsafe_inline_style", message: "Inline style contains a blocked construct." });
    }
    if (depth > MAX_DEPTH) issues.push({ code: "html_too_deep", message: `HTML nesting exceeds ${MAX_DEPTH} levels.` });
    for (const child of Array.from(element.children)) visit(child, depth + 1);
  };
  for (const child of Array.from(document.body.children)) visit(child, 1);
  if (elements > MAX_ELEMENTS) issues.push({ code: "too_many_elements", message: `HTML exceeds ${MAX_ELEMENTS} elements.` });
  if (attributes > MAX_ATTRIBUTES) issues.push({ code: "too_many_attributes", message: `HTML exceeds ${MAX_ATTRIBUTES} attributes.` });
  if (issues.length) return { ok: false, issues: issues.slice(0, 8) };
  return { ok: true, html: document.body.innerHTML, css: input.css, elementCount: elements };
}

function validateCss(css: string): StudioValidationIssue | null {
  if (/<\/style/i.test(css)) return { code: "style_termination", message: "CSS may not terminate its style element." };
  if (/@import\b/i.test(css)) return { code: "css_import", message: "CSS imports are not allowed." };
  if (/@font-face\b/i.test(css)) return { code: "font_face", message: "External font declarations are not allowed." };
  if (/url\s*\(/i.test(css)) return { code: "css_url", message: "CSS URLs are not allowed." };
  if (/expression\s*\(|-moz-binding|behavior\s*:|javascript\s*:/i.test(css)) return { code: "legacy_css_execution", message: "CSS contains a blocked execution construct." };
  return null;
}
