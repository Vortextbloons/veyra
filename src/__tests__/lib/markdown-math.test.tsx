import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownRenderer } from "@/components/markdown-renderer";

it("renders inline and display LaTeX with local KaTeX markup", () => {
  const html = renderToStaticMarkup(<MarkdownRenderer>{"$$\nx^2 + y^2 = 1\n$$\n\nEvery point $(x, y)$ lies on the circle."}</MarkdownRenderer>);
  expect(html).toContain('katex-display');
  expect(html).toContain('class="katex"');
  expect(html).toContain('<math');
});

it("keeps math inside code literal and tolerates incomplete streaming formulas", () => {
  const code = renderToStaticMarkup(<MarkdownRenderer>{"`$x^2$`"}</MarkdownRenderer>);
  expect(code).not.toContain('class="katex"');
  expect(code).toContain('$x^2$');
  expect(() => renderToStaticMarkup(<MarkdownRenderer>{"$\\frac{"}</MarkdownRenderer>)).not.toThrow();
});
