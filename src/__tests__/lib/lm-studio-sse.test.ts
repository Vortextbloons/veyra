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

async function collectEvents(chunks: string[]): Promise<Array<[string, string]>> {
  const events: Array<[string, string]> = [];
  await readV1SseStream(
    streamFromChunks(chunks),
    (eventType, data) => {
      events.push([eventType, data]);
      return "continue";
    },
  );
  return events;
}

describe("readV1SseStream", () => {
  it("parses events split across chunks", async () => {
    const events = await collectEvents(["event: message\n", "data: hello\n\n"]);

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

  it("parses CRLF-separated events", async () => {
    const events = await collectEvents([
      "event: message\r\ndata: first\r\n\r\n",
      "event: message\r\ndata: second\r\n\r\n",
      "data: [DONE]\r\n\r\n",
    ]);

    expect(events).toEqual([
      ["message", "first"],
      ["message", "second"],
      ["", "[DONE]"],
    ]);
  });

  it("parses events when a CRLF pair straddles a chunk boundary", async () => {
    const events = await collectEvents([
      "event: message\r\ndata: one\r",
      "\n\r\nevent: message\r\ndata: two\r\n\r\n",
    ]);

    expect(events).toEqual([
      ["message", "one"],
      ["message", "two"],
    ]);
  });

  it("parses mixed LF and CRLF endings", async () => {
    const events = await collectEvents([
      "event: a\ndata: one\n\n",
      "event: b\r\ndata: two\r\n\r\n",
      "event: c\rdata: three\r\r",
    ]);

    expect(events).toEqual([
      ["a", "one"],
      ["b", "two"],
      ["c", "three"],
    ]);
  });

  it("dispatches a trailing unterminated block at stream end", async () => {
    const events = await collectEvents(["event: message\ndata: tail"]);

    expect(events).toEqual([["message", "tail"]]);
  });
});