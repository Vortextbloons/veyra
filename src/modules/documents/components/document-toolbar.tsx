import { useCallback } from "react";
import { Bold, Italic, Code, List, ListOrdered, Heading1, Heading2, Quote, Link, Minus } from "lucide-react";
import { useDocumentStore } from "../document-store";

type ToolbarButton = {
  icon: React.ReactNode;
  label: string;
  prefix: string;
  suffix?: string;
  block?: boolean;
  link?: boolean;
  hr?: boolean;
};

const TOOLBAR_BUTTONS: ToolbarButton[] = [
  { icon: <Heading1 className="size-4" />, label: "Heading 1", prefix: "# ", block: true },
  { icon: <Heading2 className="size-4" />, label: "Heading 2", prefix: "## ", block: true },
  { icon: <Bold className="size-4" />, label: "Bold", prefix: "**", suffix: "**" },
  { icon: <Italic className="size-4" />, label: "Italic", prefix: "_", suffix: "_" },
  { icon: <Code className="size-4" />, label: "Code", prefix: "`", suffix: "`" },
  { icon: <List className="size-4" />, label: "Bullet List", prefix: "- ", block: true },
  { icon: <ListOrdered className="size-4" />, label: "Numbered List", prefix: "1. ", block: true },
  { icon: <Quote className="size-4" />, label: "Quote", prefix: "> ", block: true },
  { icon: <Link className="size-4" />, label: "Link", prefix: "[", suffix: "](url)", link: true },
  { icon: <Minus className="size-4" />, label: "Horizontal Rule", prefix: "", suffix: "", hr: true },
];

export function DocumentToolbar() {
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId);
  const documents = useDocumentStore((s) => s.documents);
  const setContent = useDocumentStore((s) => s.setContent);

  const doc = documents.find((d) => d.id === activeDocumentId);

  const insertFormatting = useCallback(
    (button: ToolbarButton) => {
      if (!doc) return;

      const textarea = document.querySelector(
        'textarea[data-document-editor="true"]',
      ) as HTMLTextAreaElement | null;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const value = textarea.value;
      const selectedText = value.substring(start, end);

      let newValue: string;
      let newCursorPos: number;
      let selectStart: number | null = null;
      let selectEnd: number | null = null;

      if (button.link) {
        const before = value.substring(0, start);
        const after = value.substring(end);
        const displayText = selectedText || "link text";
        newValue = before + "[" + displayText + "]()" + after;
        const urlStart = start + 1 + displayText.length + 2;
        selectStart = urlStart;
        selectEnd = urlStart;
        newCursorPos = urlStart;
      } else if (button.hr) {
        const before = value.substring(0, start);
        const after = value.substring(end);
        const needsPre = before.length > 0 && !before.endsWith("\n\n");
        const needsPost = after.length > 0 && !after.startsWith("\n\n");
        const pre = needsPre ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
        const post = needsPost ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
        newValue = before + pre + "---" + post + after;
        newCursorPos = start + pre.length + 3;
      } else if (button.block) {
        const lineStart = value.lastIndexOf("\n", start - 1) + 1;
        const before = value.substring(0, lineStart);
        const after = value.substring(lineStart);
        newValue = before + button.prefix + after;
        newCursorPos = start + button.prefix.length;
      } else {
        const before = value.substring(0, start);
        const after = value.substring(end);
        const suffix = button.suffix ?? "";
        newValue = before + button.prefix + selectedText + suffix + after;
        newCursorPos = start + button.prefix.length + selectedText.length + suffix.length;
      }

      setContent(newValue);

      requestAnimationFrame(() => {
        textarea.focus();
        if (selectStart !== null && selectEnd !== null) {
          textarea.selectionStart = selectStart;
          textarea.selectionEnd = selectEnd;
        } else {
          textarea.selectionStart = textarea.selectionEnd = newCursorPos;
        }
      });
    },
    [doc, setContent]
  );

  if (!doc) return null;

  return (
    <div className="flex items-center gap-1 border-b border-[var(--color-border)] px-2 py-1.5">
      {TOOLBAR_BUTTONS.map((button, idx) => (
        <button
          key={idx}
          type="button"
          title={button.label}
          onClick={() => insertFormatting(button)}
          className="grid size-7 place-items-center rounded text-[var(--color-text-dim)] transition-colors hover:bg-white/5 hover:text-white"
        >
          {button.icon}
        </button>
      ))}
    </div>
  );
}
