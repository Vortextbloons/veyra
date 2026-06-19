export async function formatLmStudioRequestError(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  return text
    ? `Request failed (${res.status}): ${text.slice(0, 200)}`
    : `Request failed with status ${res.status}`;
}

export function formatLmStudioCaughtError(err: unknown, signal?: AbortSignal): string {
  if (signal?.aborted) return "Request aborted";
  return err instanceof Error ? err.message : "Unknown error";
}
