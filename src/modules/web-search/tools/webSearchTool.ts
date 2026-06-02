export type WebSearchToolCall = {
  tool: "web.search";
  args: {
    query: string;
  };
};

function extractJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
      continue;
    }
    if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

function isWebSearchToolCall(value: unknown): value is WebSearchToolCall {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as WebSearchToolCall).tool === "web.search" &&
    typeof (value as WebSearchToolCall).args === "object" &&
    (value as WebSearchToolCall).args !== null &&
    typeof (value as WebSearchToolCall).args.query === "string" &&
    (value as WebSearchToolCall).args.query.trim().length > 0
  );
}

export function parseWebSearchToolCall(text: string): WebSearchToolCall | null {
  for (const objectText of extractJsonObjects(text)) {
    try {
      const parsed = JSON.parse(objectText) as unknown;
      if (isWebSearchToolCall(parsed)) {
        return { tool: "web.search", args: { query: parsed.args.query.trim() } };
      }
    } catch {
      // Keep scanning; model output may contain non-tool JSON examples.
    }
  }
  return null;
}

export function stripWebSearchToolCall(text: string): string {
  for (const objectText of extractJsonObjects(text)) {
    try {
      if (isWebSearchToolCall(JSON.parse(objectText) as unknown)) {
        return text.replace(objectText, "").replace(/\n{3,}/g, "\n\n").trim();
      }
    } catch {
      // Keep scanning.
    }
  }
  return text.trim();
}
