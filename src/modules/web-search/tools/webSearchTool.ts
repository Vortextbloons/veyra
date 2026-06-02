export type WebSearchToolCall = {
  tool: "web.search";
  args: {
    query: string;
  };
};

export function parseWebSearchToolCall(text: string): WebSearchToolCall | null {
  const regex = /\{[\s\S]*?"tool"\s*:\s*"web\.search"[\s\S]*?"args"\s*:\s*\{[\s\S]*?"query"\s*:\s*"[^"]*"[\s\S]*?\}[\s\S]*?\}/;
  const match = text.match(regex);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]) as WebSearchToolCall;
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      parsed.tool === "web.search" &&
      typeof parsed.args === "object" &&
      parsed.args !== null &&
      typeof parsed.args.query === "string" &&
      parsed.args.query.trim().length > 0
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
