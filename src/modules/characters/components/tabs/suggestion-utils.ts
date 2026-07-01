export function tryParseSuggestionBuffer(buffer: string): unknown | null {
  try {
    const trimmed = buffer.trim().replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
