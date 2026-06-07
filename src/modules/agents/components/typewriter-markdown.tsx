import { useEffect, useRef, useState } from "react";
import { MarkdownRenderer } from "@/components/markdown-renderer";

export function TypewriterMarkdown({ content, enabled }: { content: string; enabled: boolean }) {
  const [visible, setVisible] = useState(enabled ? "" : content);
  const visibleRef = useRef(visible);

  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);

  useEffect(() => {
    if (!enabled) {
      visibleRef.current = content;
      setVisible(content);
      return;
    }

    let index = content.startsWith(visibleRef.current) ? visibleRef.current.length : 0;
    if (index > content.length) index = 0;
    visibleRef.current = content.slice(0, index);
    setVisible(visibleRef.current);
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
      <MarkdownRenderer className="leading-snug">{visible}</MarkdownRenderer>
      {enabled && visible.length < content.length && (
        <span className="ml-0.5 inline-block size-2 animate-pulse rounded-full bg-indigo-300 align-middle" />
      )}
    </>
  );
}
