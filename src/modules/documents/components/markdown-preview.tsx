import { lazy, memo, Suspense } from "react";

const MarkdownRenderer = lazy(() =>
  import("@/components/markdown-renderer").then((m) => ({ default: m.MarkdownRenderer })),
);

interface MarkdownPreviewProps {
  content: string;
  className?: string;
}

export const MarkdownPreview = memo(function MarkdownPreview({
  content,
  className,
}: MarkdownPreviewProps) {
  if (!content.trim()) {
    return (
      <div className={`flex h-full items-center justify-center text-[var(--color-text-dim)] ${className ?? ""}`}>
        <p className="text-[13px]">Nothing to preview</p>
      </div>
    );
  }

  return (
    <div className={`overflow-y-auto p-6 ${className ?? ""}`}>
      <Suspense fallback={<div className="animate-pulse text-[13px] text-[var(--color-text-dim)]">Loading preview...</div>}>
        <MarkdownRenderer className="max-w-none leading-relaxed">{content}</MarkdownRenderer>
      </Suspense>
    </div>
  );
});
