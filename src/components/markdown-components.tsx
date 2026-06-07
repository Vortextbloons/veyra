import type { Components } from "react-markdown";
import { CodeBlock, InlineCode } from "@/components/ui/code-block";

export const MARKDOWN_COMPONENTS: Components = {
  code({ className: codeClassName, children: codeChildren }) {
    const match = /language-(\w+)/.exec(codeClassName || "");
    const isInline = !codeClassName && !String(codeChildren).includes("\n");

    if (isInline) {
      return <InlineCode>{codeChildren}</InlineCode>;
    }

    const rawCode = String(codeChildren).replace(/\n$/, "");
    return (
      <CodeBlock language={match?.[1]} rawCode={rawCode}>
        <code className={codeClassName}>{rawCode}</code>
      </CodeBlock>
    );
  },
  pre({ children }) {
    return <>{children}</>;
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-accent)] underline underline-offset-2 hover:text-[var(--color-accent)]/80"
      >
        {children}
      </a>
    );
  },
  table({ children }) {
    return (
      <div className="my-3 overflow-x-auto rounded-lg border border-[var(--color-border)]">
        <table className="w-full border-collapse text-[12px]">{children}</table>
      </div>
    );
  },
  thead({ children }) {
    return (
      <thead className="border-b border-[var(--color-border)] bg-white/[0.03]">
        {children}
      </thead>
    );
  },
  th({ children }) {
    return (
      <th className="px-3 py-2 text-left font-medium text-[var(--color-text)]">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-t border-[var(--color-border)] px-3 py-2 text-[var(--color-text-dim)]">
        {children}
      </td>
    );
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-3 border-l-2 border-[var(--color-accent)]/40 pl-4 text-[var(--color-text-dim)]">
        {children}
      </blockquote>
    );
  },
  hr() {
    return <hr className="my-4 border-[var(--color-border)]" />;
  },
  ul({ children }) {
    return <ul className="my-2 list-disc pl-5 marker:text-[var(--color-muted)]">{children}</ul>;
  },
  ol({ children }) {
    return <ol className="my-2 list-decimal pl-5 marker:text-[var(--color-muted)]">{children}</ol>;
  },
  li({ children }) {
    return <li className="py-0.5 leading-snug">{children}</li>;
  },
  h1({ children }) {
    return <h1 className="mb-2 mt-4 text-xl font-bold">{children}</h1>;
  },
  h2({ children }) {
    return <h2 className="mb-2 mt-3 text-lg font-semibold">{children}</h2>;
  },
  h3({ children }) {
    return <h3 className="mb-1 mt-3 text-base font-semibold">{children}</h3>;
  },
  p({ children }) {
    return <p className="m-0 py-1 leading-snug">{children}</p>;
  },
  strong({ children }) {
    return <strong className="font-semibold text-[var(--color-text)]">{children}</strong>;
  },
};
