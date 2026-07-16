import { describe, expect, it } from "vitest";
import { processOpenAiStreamData } from "@/lib/lm-studio-openai";
import type { OpenAiStreamState } from "@/lib/lm-studio-types";

function makeState(): OpenAiStreamState {
  return {
    accumulatedContent: "",
    accumulatedReasoning: "",
    toolCallAccumulators: new Map(),
    notifiedToolIndices: new Set(),
  };
}

function streamContent(chunks: string[]) {
  const state = makeState();
  let content = "";
  let reasoning = "";
  const onChunk = (chunk: string) => { content += chunk; };
  const onReasoningChunk = (chunk: string) => { reasoning += chunk; };

  for (const chunk of chunks) {
    processOpenAiStreamData(
      JSON.stringify({ choices: [{ delta: { content: chunk } }] }),
      state,
      onChunk,
      onReasoningChunk,
    );
  }
  processOpenAiStreamData("[DONE]", state, onChunk, onReasoningChunk);
  return { content, reasoning, state };
}

describe("OpenAI-compatible reasoning protocol normalization", () => {
  it("removes the channel markers leaked by models that emit a thought channel", () => {
    const result = streamContent([
      "<|channel|>thought <|channel|>Hello. I am Veyra. How can I help you today?",
    ]);

    expect(result.content).toBe("Hello. I am Veyra. How can I help you today?");
    expect(result.reasoning).toBe("");
  });

  it("routes split Harmony analysis to reasoning and final text to content", () => {
    const result = streamContent([
      "<|chan",
      "nel|>analysis<|message|>I should answer briefly.<|end|><|start|>assistant",
      "<|channel|>final<|message|>Hello!",
    ]);

    expect(result.reasoning).toBe("I should answer briefly.");
    expect(result.content).toBe("Hello!");
  });

  it("routes split think blocks to reasoning without leaking tags", () => {
    const result = streamContent(["<thi", "nk>Plan first.", "</think>Hello!"]);

    expect(result.reasoning).toBe("Plan first.");
    expect(result.content).toBe("Hello!");
  });
});
