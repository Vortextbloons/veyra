import { useMemo } from "react";
import hljs from "highlight.js";

export function HighlightedCode({
  code,
  language = "python",
}: {
  code: string;
  language?: string;
}) {
  const html = useMemo(() => {
    if (!code.trim()) return "";
    try {
      return hljs.highlight(code, { language }).value;
    } catch {
      return hljs.highlightAuto(code).value;
    }
  }, [code, language]);

  return (
    <pre className="max-h-72 overflow-auto rounded-md border border-[var(--color-border)] bg-black/20 px-3 py-2 text-[11px] leading-relaxed text-[var(--color-text)]">
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}
