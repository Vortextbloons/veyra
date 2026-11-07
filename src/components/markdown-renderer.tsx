import { memo } from "react";
import Markdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { MARKDOWN_COMPONENTS } from "@/components/markdown-components";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  children: string;
  className?: string;
  deferHighlight?: boolean;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  children,
  className,
  deferHighlight = false,
}: MarkdownRendererProps) {
  return (
    <div className={cn("markdown-rendered", className)}>
      <Markdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={deferHighlight ? [] : [rehypeHighlight, rehypeKatex]}
        components={MARKDOWN_COMPONENTS}
      >
        {children}
      </Markdown>
    </div>
  );
});
