/* eslint-disable react-refresh/only-export-components */
import { defineComponent } from "@openuidev/react-lang";
import katex from "katex";
import { Check, Copy } from "lucide-react";
import { Fragment, useState } from "react";
import { z } from "zod/v4";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { inline } from "./inline";
import { children, color, cx, fg, webUrl } from "./style";

const str = (value: unknown) => (value == null ? "" : String(value));
const HEADING_LEVEL: Record<string, number> = { "3xl": 1, "2xl": 2, xl: 2, lg: 3, md: 3, sm: 4 };

const TITLE_SIZE: Record<string, string> = {
  sm: "text-[12.5px] font-medium",
  md: "text-[13.5px] font-semibold",
  lg: "text-[15.5px] font-semibold",
  xl: "text-[18px] font-semibold",
  "2xl": "text-[22px] font-semibold",
  "3xl": "text-[27px] font-semibold tracking-[-0.01em]",
};

export const Title = defineComponent({
  name: "Title",
  props: z.object({
    text: z.string(),
    size: z.enum(["sm", "md", "lg", "xl", "2xl", "3xl"]).optional(),
    color: color.optional(),
  }),
  description: "Heading; md for a card title, lg for a section, 2xl for a big number.",
  component: ({ props }) => {
    const size = props.size ?? "md";
    return (
      <div
        role="heading"
        aria-level={HEADING_LEVEL[size] ?? 3}
        className={cx("m-0 leading-tight", TITLE_SIZE[size])}
        style={{ color: fg(props.color) }}
      >
        {inline(str(props.text))}
      </div>
    );
  },
});

/** Text, or a run of strings and inline components such as Icon, Badge, Link or Math. */
const richText = z.union([z.string(), children]);
const isNode = (value: unknown) => !!value && typeof value === "object" && (value as { type?: unknown }).type === "element";

const TEXT_SIZE: Record<string, string> = {
  xs: "text-[10.5px]",
  sm: "text-[11.5px]",
  md: "text-[12.5px]",
  lg: "text-[13.5px]",
};

export const Text = defineComponent({
  name: "Text",
  props: z.object({
    text: richText,
    size: z.enum(["xs", "sm", "md", "lg"]).optional(),
    color: color.optional(),
    weight: z.enum(["normal", "medium", "semibold"]).optional(),
    italic: z.boolean().optional(),
    lineThrough: z.boolean().optional(),
    tabularNums: z.boolean().optional(),
    maxLines: z.number().optional(),
  }),
  description:
    'Paragraph; supports **bold**, *italic*, `code` and [links](https://…). text may be a list mixing strings and inline components: [Icon("clock", "sm"), " 25 min · ", Badge("Easy")].',
  component: ({ props, renderNode }) => {
    const lines = props.maxLines && props.maxLines > 0 ? Math.round(props.maxLines) : undefined;
    return (
      <p
        className={cx("m-0 leading-relaxed", TEXT_SIZE[props.size ?? "md"])}
        style={{
          color: fg(props.color) ?? "var(--color-text)",
          fontWeight: props.weight === "medium" ? 500 : props.weight === "semibold" ? 600 : undefined,
          fontStyle: props.italic ? "italic" : undefined,
          textDecoration: props.lineThrough ? "line-through" : undefined,
          fontVariantNumeric: props.tabularNums ? "tabular-nums" : undefined,
          ...(lines
            ? { display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical" as const, overflow: "hidden" }
            : {}),
        }}
      >
        {Array.isArray(props.text)
          ? (props.text as unknown[])
              .flat()
              .map((part, index) =>
                isNode(part) ? (
                  <span key={index} className="inline-flex align-middle">
                    {renderNode(part)}
                  </span>
                ) : (
                  <Fragment key={index}>{inline(str(part))}</Fragment>
                ),
              )
          : inline(str(props.text))}
      </p>
    );
  },
});

export const Caption = defineComponent({
  name: "Caption",
  props: z.object({ text: z.string(), color: color.optional() }),
  description: "Small secondary text.",
  component: ({ props }) => (
    <p
      className="m-0 text-[10.5px] leading-snug"
      style={{ color: fg(props.color) ?? "var(--color-text-dim)" }}
    >
      {inline(str(props.text))}
    </p>
  ),
});

export const Label = defineComponent({
  name: "Label",
  props: z.object({ text: z.string() }),
  description: "Field or group label.",
  component: ({ props }) => (
    <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--color-text-dim)]">
      {str(props.text)}
    </span>
  ),
});

const BADGE_TONE: Record<string, string> = {
  neutral: "border-white/[0.1] bg-white/[0.06] text-[var(--color-text-dim)]",
  info: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  success: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  warning: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  danger: "border-red-400/20 bg-red-400/10 text-red-200",
  accent: "border-violet-400/20 bg-violet-400/10 text-violet-200",
};

export const Badge = defineComponent({
  name: "Badge",
  props: z.object({
    text: z.string(),
    color: z.enum(["neutral", "info", "success", "warning", "danger", "accent"]).optional(),
  }),
  description: "",
  component: ({ props }) => (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] font-medium leading-none",
        BADGE_TONE[props.color ?? "neutral"],
      )}
    >
      {str(props.text)}
    </span>
  ),
});

export const Link = defineComponent({
  name: "Link",
  props: z.object({ text: z.string(), url: z.string() }),
  description: "Opens an http(s) URL in a new tab.",
  component: ({ props }) => {
    const url = webUrl(props.url);
    if (!url) return <span>{str(props.text)}</span>;
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-[var(--color-focus)] underline decoration-[var(--color-focus)]/40 underline-offset-2 hover:decoration-[var(--color-focus)]"
      >
        {str(props.text)}
      </a>
    );
  },
});

const MARKER: Record<string, string> = { bullet: "•", number: "", none: "" };

export const ListItem = defineComponent({
  name: "ListItem",
  props: z.object({
    title: z.string(),
    description: z.string().optional(),
    marker: z.string().optional(),
    children: children.optional(),
  }),
  description: 'marker replaces the bullet or number, e.g. a time or an emoji.',
  component: ({ props, renderNode }) => (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[12.5px] leading-snug text-[var(--color-text)]">{inline(str(props.title))}</span>
      {props.description ? (
        <span className="text-[11px] leading-relaxed text-[var(--color-text-dim)]">{inline(str(props.description))}</span>
      ) : null}
      {props.children ? <div className="mt-1 flex flex-col gap-1.5">{renderNode(props.children)}</div> : null}
    </div>
  ),
});

export const List = defineComponent({
  name: "List",
  props: z.object({
    items: z.array(z.union([z.string(), ListItem.ref])),
    marker: z.enum(["bullet", "number", "none"]).optional(),
    timeline: z.boolean().optional(),
  }),
  description: "timeline joins the markers with a line.",
  component: ({ props, renderNode }) => {
    const marker = props.marker ?? "bullet";
    const items = (props.items ?? []).flat().filter((item) => item != null);
    if (props.timeline) {
      return (
        <ol className="relative m-0 flex list-none flex-col gap-3 p-0 pl-4">
          <span aria-hidden className="absolute inset-y-1 left-[3px] w-px bg-white/[0.12]" />
          {items.map((item, index) => (
            <li key={index} className="relative min-w-0">
              <span
                aria-hidden
                className="absolute -left-4 top-[5px] size-[7px] rounded-full border border-[var(--color-accent)] bg-[var(--color-panel)]"
              />
              {isNode(item) ? (
                <div className="flex flex-col gap-0.5">{renderNode(item)}</div>
              ) : (
                <span className="text-[12.5px] leading-snug text-[var(--color-text)]">{inline(str(item))}</span>
              )}
            </li>
          ))}
        </ol>
      );
    }
    const ordered = marker === "number";
    return (
      <ul
        className={cx(
          "m-0 flex list-none flex-col gap-1.5 p-0",
        )}
      >
        {items.map((item, index) => (
          <li key={index} className="flex min-w-0 items-start gap-2">
            {marker !== "none" ? (
              <span
                aria-hidden
                className="mt-[3px] shrink-0 text-[10.5px] tabular-nums text-[var(--color-text-dim)]"
              >
                {ordered ? `${index + 1}.` : MARKER[marker]}
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              {isNode(item) ? (
                <div className="flex flex-col gap-0.5">{renderNode(item)}</div>
              ) : (
                <span className="text-[12.5px] leading-snug text-[var(--color-text)]">{inline(str(item))}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
    );
  },
});

export const Markdown = defineComponent({
  name: "Markdown",
  props: z.object({ text: z.string() }),
  description: "Prose with headings, lists, quotes, code and tables.",
  component: ({ props }) => (
    <div className="text-[12.5px] leading-relaxed">
      <MarkdownRenderer>{str(props.text)}</MarkdownRenderer>
    </div>
  ),
});

export const Quote = defineComponent({
  name: "Quote",
  props: z.object({ text: z.string(), cite: z.string().optional() }),
  description: "A quotation or a callout with a side rule; cite names the source.",
  component: ({ props }) => (
    <blockquote className="m-0 border-l-2 border-[var(--color-accent)]/50 pl-3">
      <p className="m-0 text-[12.5px] italic leading-relaxed text-[var(--color-text-dim)]">
        {inline(str(props.text))}
      </p>
      {props.cite ? (
        <cite className="mt-1 block text-[10.5px] not-italic text-[var(--color-text-dim)]/80">
          — {str(props.cite)}
        </cite>
      ) : null}
    </blockquote>
  ),
});

export const Code = defineComponent({
  name: "Code",
  props: z.object({ code: z.string(), language: z.string().optional() }),
  description: "Code block with a copy button.",
  component: ({ props }) => <CodeBlock code={str(props.code)} language={props.language} />,
});

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="group relative overflow-hidden rounded-lg border border-white/[0.09] bg-black/40">
      <div className="flex items-center justify-between border-b border-white/[0.06] px-2.5 py-1">
        <span className="text-[9.5px] font-medium uppercase tracking-[0.1em] text-[var(--color-text-dim)]">
          {language || "code"}
        </span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1400);
            });
          }}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-text-dim)] transition-colors hover:bg-white/[0.06] hover:text-[var(--color-text)]"
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="m-0 overflow-x-auto p-2.5 font-mono text-[11.5px] leading-relaxed text-[var(--color-text)]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export const MathBlock = defineComponent({
  name: "Math",
  props: z.object({ tex: z.string(), inline: z.boolean().optional() }),
  description: 'LaTeX formula, e.g. Math("E = mc^2"); inline true to sit in a Text list.',
  component: ({ props }) => {
    let html: string;
    try {
      html = katex.renderToString(str(props.tex), {
        displayMode: !props.inline,
        throwOnError: false,
        output: "html",
      });
    } catch {
      return <code>{str(props.tex)}</code>;
    }
    return (
      <span
        className={props.inline ? "inline-block align-middle" : "block overflow-x-auto py-1 text-center"}
        // KaTeX output is generated from the formula string, not model HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  },
});
