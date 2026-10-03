function isClosedTauriResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /resource id \d+ is invalid/i.test(message);
}

type SseEventHandler = (eventType: string, data: string) => "continue" | "done";

/**
 * Parse a single SSE block (lines between blank-line separators) and dispatch
 * its data payload. Returns true when the consumer signaled "done".
 */
function dispatchSseBlock(block: string, onEvent: SseEventHandler): boolean {
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

  if (data && onEvent(eventType, data) === "done") return true;
  return false;
}

export async function readV1SseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: SseEventHandler,
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
      // Servers may separate events with "\n\n" or "\r\n\r\n", and a "\r\n"
      // pair can straddle a chunk boundary. Normalize line endings to "\n",
      // but hold back a trailing "\r" until we know whether a "\n" follows.
      let trailingCr = "";
      if (buffer.endsWith("\r")) {
        trailingCr = "\r";
        buffer = buffer.slice(0, -1);
      }
      buffer = buffer.replace(/\r\n?/g, "\n") + trailingCr;

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        if (dispatchSseBlock(block, onEvent)) return;
      }
    }

    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail) {
      dispatchSseBlock(tail, onEvent);
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