import { describe, expect, it } from "vitest";
import { readV1SseStream } from "../../lib/lm-studio-sse";

function streamFromChunks(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("readV1SseStream", () => {
  it("parses events split across chunks", async () => {
    const events: Array<[string, string]> = [];

    await readV1SseStream(
      streamFromChunks(["event: message\n", "data: hello\n\n"]),
      (eventType, data) => {
        events.push([eventType, data]);
        return "continue";
      },
    );

    expect(events).toEqual([["message", "hello"]]);
  });

  it("stops when the event handler returns done", async () => {
    const events: Array<[string, string]> = [];

    await readV1SseStream(
      streamFromChunks([
        "event: first\ndata: one\n\n",
        "event: second\ndata: two\n\n",
      ]),
      (eventType, data) => {
        events.push([eventType, data]);
        return "done";
      },
    );

    expect(events).toEqual([["first", "one"]]);
  });
});
