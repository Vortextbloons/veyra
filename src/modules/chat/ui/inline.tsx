import { Fragment, type ReactNode } from "react";
import { webUrl } from "./style";

/**
 * Inline formatting for `Text` and `Title`: **bold**, *italic*, `code` and
 * [links](https://…). Rendered without a markdown engine so a single line of
 * model text stays cheap to draw while streaming.
 */
const INLINE_TOKEN = /(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+\))/g;

export function inline(text: string): ReactNode {
  if (!text) return null;
  const parts = text.split(INLINE_TOKEN);
  return parts.map((part, index) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-[var(--color-text)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={index}>{part.slice(1, -1)}</em>;
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={index}
          className="rounded border border-white/[0.08] bg-white/[0.05] px-1 py-px font-mono text-[0.92em] text-[var(--color-text)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]\n]+)\]\(([^)\s]+)\)$/.exec(part);
    if (link) {
      const url = webUrl(link[2]);
      return url ? (
        <a
          key={index}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="text-[var(--color-focus)] underline decoration-[var(--color-focus)]/40 underline-offset-2 hover:decoration-[var(--color-focus)]"
        >
          {link[1]}
        </a>
      ) : (
        <Fragment key={index}>{link[1]}</Fragment>
      );
    }
    return <Fragment key={index}>{part}</Fragment>;
  });
}
