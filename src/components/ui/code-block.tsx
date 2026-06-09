import { useState, useCallback, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";

function CodeBlockHeader({
  language,
  rawCode,
}: {
  language?: string;
  rawCode: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(rawCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [rawCode]);

  return (
    <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.03] px-4 py-1.5">
      <span className="text-[11px] font-medium text-[var(--color-text-dim)]">
        {language || "code"}
      </span>
      <button
        onClick={handleCopy}
        className="flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-[var(--color-text)]"
      >
        {copied ? (
          <>
            <Check className="size-3" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="size-3" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

export function CodeBlock({
  language,
  rawCode,
  children,
}: {
  language?: string;
  rawCode: string;
  children: ReactNode;
}) {
  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[var(--color-border)] bg-[#0d0e14]">
      <CodeBlockHeader language={language} rawCode={rawCode} />
      <div className="overflow-x-auto p-4">
        {children}
      </div>
    </div>
  );
}

export function InlineCode({ children }: { children: ReactNode }) {
  return (
    <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[0.9em] text-[var(--color-accent)]">
      {children}
    </code>
  );
}
