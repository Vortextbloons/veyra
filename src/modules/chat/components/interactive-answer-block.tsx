import { memo, useCallback, useMemo } from "react";
import { Renderer, type ActionEvent } from "@openuidev/react-lang";
import { Layers3 } from "lucide-react";
import { normalizeInteractiveAnswer, type InteractiveAnswer } from "@/modules/chat/interactive-answer";
import { runLibraryAction } from "@/modules/chat/ui/actions";
import { library } from "@/modules/chat/ui/library";
import { webUrl } from "@/modules/chat/ui/style";

export type InteractiveAnswerBlockProps = {
  answer: InteractiveAnswer;
  onFollowUp?: (prompt: string) => void;
};

/** Flattens the renderer's form state into the values a follow-up needs. */
function formValues(formState: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!formState) return {};
  const values: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(formState)) {
    if (key.startsWith("$")) {
      values[key.slice(1)] = entry;
      continue;
    }
    if (entry && typeof entry === "object" && "value" in (entry as Record<string, unknown>)) {
      values[key] = (entry as { value: unknown }).value;
    }
  }
  return values;
}

async function openExternal(url: string) {
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export const InteractiveAnswerBlock = memo(function InteractiveAnswerBlock({
  answer,
  onFollowUp,
}: InteractiveAnswerBlockProps) {
  const normalized = useMemo(() => normalizeInteractiveAnswer(answer, answer.id), [answer]);

  const handleAction = useCallback(
    (event: ActionEvent) => {
      const handled = runLibraryAction(event);
      if (handled) return;

      if (event.type === "continue_conversation") {
        if (!onFollowUp) return;
        const message = event.humanFriendlyMessage?.trim() || "Tell me more about this.";
        const values = formValues(event.formState);
        const entries = Object.entries(values).filter(([, value]) => value !== "" && value != null);
        const context = entries.length
          ? `\n\nValues from the interactive answer: ${entries.map(([key, value]) => `${key}: ${String(value)}`).join(", ")}`
          : "";
        onFollowUp(message + context);
        return;
      }

      if (event.type === "open_url") {
        const url = webUrl(event.params?.url);
        if (url) void openExternal(url);
      }
    },
    [onFollowUp],
  );

  if (!normalized.ok) return null;
  const program = normalized.answer.program;
  const title = normalized.answer.title;

  return (
    <section className="my-2 overflow-hidden rounded-xl border border-white/[0.09] bg-[var(--color-panel)]/55 shadow-lg shadow-black/10">
      <header className="flex items-center gap-2.5 border-b border-white/[0.07] px-3.5 py-2">
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-accent-tint text-accent">
          <Layers3 className="size-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[12px] font-medium leading-snug text-[var(--color-text)]">
            {title || "Interactive answer"}
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-accent-line-soft bg-accent-tint px-1.5 py-0.5 text-[8.5px] font-medium uppercase tracking-[0.1em] text-accent">
          Interactive
        </span>
      </header>
      <div className="px-3.5 py-3.5">
        <Renderer
          response={program}
          library={library}
          isStreaming={false}
          onAction={handleAction}
        />
      </div>
    </section>
  );
});
