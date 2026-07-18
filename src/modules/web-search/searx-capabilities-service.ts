import { invokeGetSearxngCapabilities } from "./tauri-commands";
import type { SearxCapabilities } from "./types";

const CAPABILITY_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, SearxCapabilities>();
const inflight = new Map<string, Promise<SearxCapabilities>>();

export async function getSearxCapabilities(baseUrl: string): Promise<SearxCapabilities> {
  const key = baseUrl.trim().replace(/\/$/, "");
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CAPABILITY_TTL_MS) return cached;
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = invokeGetSearxngCapabilities(key)
    .then((capabilities) => {
      cache.set(key, capabilities);
      return capabilities;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, pending);
  return pending;
}

export function clearSearxCapabilitiesCache(): void {
  cache.clear();
}
