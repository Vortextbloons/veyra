function isClosedTauriResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /resource id \d+ is invalid/i.test(message);
}

export async function readV1SseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (eventType: string, data: string) => "continue" | "done",
  signal?: AbortSignal,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel().catch((error: unknown) => {
          if (!isClosedTauriResourceError(error)) throw error;
        });
        return;
      }

      const { done, value } = await reader.read().catch((error: unknown) => {
        if (signal?.aborted || isClosedTauriResourceError(error)) {
          return { done: true, value: undefined } as ReadableStreamReadResult<Uint8Array>;
        }
        throw error;
      });
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        let eventType = "";
        let data = "";

        for (const line of block.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            eventType = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            data = trimmed.slice(5).trim();
          }
        }

        if (data && onEvent(eventType, data) === "done") return;
      }
    }

    const tail = buffer.trim();
    if (tail) {
      let eventType = "";
      let data = "";
      for (const line of tail.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("event:")) eventType = trimmed.slice(6).trim();
        else if (trimmed.startsWith("data:")) data = trimmed.slice(5).trim();
      }
      if (data) onEvent(eventType, data);
    }
  } finally {
    try {
      reader.releaseLock();
    } catch (error) {
      if (!isClosedTauriResourceError(error)) {
        console.warn("[LM Studio] Failed to release stream reader:", error);
      }
    }
  }
}
