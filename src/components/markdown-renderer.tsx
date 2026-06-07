import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { MARKDOWN_COMPONENTS } from "@/components/markdown-components";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  children: string;
  className?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  children,
  className,
}: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-rendered", className)}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={MARKDOWN_COMPONENTS}
      >
        {children}
      </Markdown>
    </div>
  );
});
