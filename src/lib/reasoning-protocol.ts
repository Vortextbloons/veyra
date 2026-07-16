export type ReasoningProtocolState = {
  buffer: string;
  mode: "content" | "reasoning";
  expectsChannelLabel: boolean;
  expectsRole: boolean;
};

export type ReasoningProtocolOutput = {
  content: string;
  reasoning: string;
};

const REASONING_CHANNELS = new Set(["analysis", "reasoning", "thought", "thinking"]);
const CONTENT_CHANNELS = new Set(["final", "commentary", "answer", "response"]);
const CHANNEL_LABELS = [...REASONING_CHANNELS, ...CONTENT_CHANNELS];
const ROLES = ["assistant", "system", "user", "developer", "tool"];
const PARTIAL_MARKERS = ["<|", "<think>", "</think>"];

export function createReasoningProtocolState(): ReasoningProtocolState {
  return {
    buffer: "",
    mode: "content",
    expectsChannelLabel: false,
    expectsRole: false,
  };
}

function appendOutput(
  output: ReasoningProtocolOutput,
  mode: ReasoningProtocolState["mode"],
  text: string,
) {
  if (!text) return;
  output[mode] += text;
}

function possibleWordPrefix(buffer: string, words: string[]): boolean {
  const candidate = buffer.trimStart().toLowerCase();
  if (!candidate || !/^[a-z_-]+$/.test(candidate)) return false;
  return words.some((word) => word.startsWith(candidate));
}

function consumeExpectedWord(
  state: ReasoningProtocolState,
  words: string[],
  flush: boolean,
): string | null | undefined {
  const leadingWhitespace = state.buffer.match(/^\s*/)?.[0] ?? "";
  const rest = state.buffer.slice(leadingWhitespace.length);
  const wordMatch = rest.match(/^([a-z_-]+)/i);

  if (!wordMatch) {
    if (!flush && !rest) return undefined;
    state.buffer = rest;
    return null;
  }

  const word = wordMatch[1].toLowerCase();
  const afterWord = rest.slice(wordMatch[1].length);
  if (!flush && !afterWord && possibleWordPrefix(rest, words)) return undefined;
  if (!words.includes(word)) {
    state.buffer = rest;
    return null;
  }

  state.buffer = afterWord.replace(/^\s+/, "");
  return word;
}

function earliestMarkerIndex(buffer: string): number {
  const lower = buffer.toLowerCase();
  const indices = [lower.indexOf("<|"), lower.indexOf("<think"), lower.indexOf("</think")]
    .filter((index) => index >= 0);
  return indices.length > 0 ? Math.min(...indices) : -1;
}

function partialMarkerLength(buffer: string): number {
  const lower = buffer.toLowerCase();
  let longest = 0;
  for (const marker of PARTIAL_MARKERS) {
    const max = Math.min(lower.length, marker.length - 1);
    for (let length = 1; length <= max; length += 1) {
      if (lower.endsWith(marker.slice(0, length))) longest = Math.max(longest, length);
    }
  }
  return longest;
}

export function processReasoningProtocolChunk(
  state: ReasoningProtocolState,
  chunk: string,
  flush = false,
): ReasoningProtocolOutput {
  state.buffer += chunk;
  const output: ReasoningProtocolOutput = { content: "", reasoning: "" };

  while (state.buffer) {
    if (state.expectsChannelLabel) {
      const label = consumeExpectedWord(state, CHANNEL_LABELS, flush);
      if (label === undefined) break;
      state.expectsChannelLabel = false;
      if (label && REASONING_CHANNELS.has(label)) state.mode = "reasoning";
      if (label && CONTENT_CHANNELS.has(label)) state.mode = "content";
      continue;
    }

    if (state.expectsRole) {
      const role = consumeExpectedWord(state, ROLES, flush);
      if (role === undefined) break;
      state.expectsRole = false;
      continue;
    }

    const markerIndex = earliestMarkerIndex(state.buffer);
    if (markerIndex < 0) {
      const heldLength = flush ? 0 : partialMarkerLength(state.buffer);
      const emittedLength = state.buffer.length - heldLength;
      appendOutput(output, state.mode, state.buffer.slice(0, emittedLength));
      state.buffer = state.buffer.slice(emittedLength);
      break;
    }

    if (markerIndex > 0) {
      appendOutput(output, state.mode, state.buffer.slice(0, markerIndex));
      state.buffer = state.buffer.slice(markerIndex);
      continue;
    }

    const lower = state.buffer.toLowerCase();
    if (lower.startsWith("<think>")) {
      state.buffer = state.buffer.slice("<think>".length);
      state.mode = "reasoning";
      continue;
    }
    if (lower.startsWith("</think>")) {
      state.buffer = state.buffer.slice("</think>".length);
      state.mode = "content";
      continue;
    }

    if (lower.startsWith("<think") || lower.startsWith("</think")) {
      const closeIndex = state.buffer.indexOf(">");
      if (closeIndex < 0 && !flush) break;
      state.buffer = closeIndex >= 0 ? state.buffer.slice(closeIndex + 1) : "";
      state.mode = lower.startsWith("</") ? "content" : "reasoning";
      continue;
    }

    const tokenEnd = state.buffer.indexOf("|>");
    if (tokenEnd < 0) {
      if (!flush) break;
      state.buffer = "";
      break;
    }

    const token = state.buffer.slice(2, tokenEnd).trim().toLowerCase();
    state.buffer = state.buffer.slice(tokenEnd + 2);

    if (token === "channel") {
      state.mode = "content";
      state.expectsChannelLabel = true;
    } else if (token === "start") {
      state.mode = "content";
      state.expectsRole = true;
    } else if (token === "end" || token === "end_of_text" || token === "eot_id") {
      state.mode = "content";
    } else if (REASONING_CHANNELS.has(token)) {
      state.mode = "reasoning";
    } else if (CONTENT_CHANNELS.has(token) || token === "assistant") {
      state.mode = "content";
    }
  }

  return output;
}
