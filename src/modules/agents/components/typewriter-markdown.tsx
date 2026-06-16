import { lazy, Suspense, useEffect, useRef, useState } from "react";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
);

export function TypewriterMarkdown({ content, enabled }: { content: string; enabled: boolean }) {
  const [visible, setVisible] = useState(enabled ? "" : content);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!enabled) {
      const timer = window.setTimeout(() => {
        visibleRef.current = content;
        setVisible(content);
      }, 0);
      return () => window.clearTimeout(timer);
    }

    let index = content.startsWith(visibleRef.current) ? visibleRef.current.length : 0;
    if (index > content.length) index = 0;
    const nextVisible = content.slice(0, index);
    visibleRef.current = nextVisible;
    if (index >= content.length) return;

    const interval = window.setInterval(() => {
      const remaining = content.length - index;
      const step = remaining > 800 ? 8 : remaining > 300 ? 5 : 3;
      index = Math.min(content.length, index + step);
      const next = content.slice(0, index);
      visibleRef.current = next;
      setVisible(next);
      if (index >= content.length) window.clearInterval(interval);
    }, 16);

    return () => window.clearInterval(interval);
  }, [content, enabled]);

  return (
    <>
      <Suspense>
        <MarkdownRenderer className="leading-snug">{visible}</MarkdownRenderer>
      </Suspense>
      {enabled && visible.length < content.length && (
        <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-300 align-middle" />
      )}
    </>
  );
}
