import { setTimeout as delay } from 'node:timers/promises';

/** Retry temporary download failures, including interrupted response bodies. */
export async function fetchWithRetry(url, read, { fetchImpl = fetch, sleep = delay, attempts = 5 } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchImpl(url, {
        headers: { 'User-Agent': 'Veyra-build' },
        redirect: 'follow',
        signal: AbortSignal.timeout(180_000),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const error = new Error(`Download failed (${response.status}) for ${url}`);
        error.permanent = ![408, 429, 500, 502, 503, 504].includes(response.status);
        throw error;
      }
      return await read(response);
    } catch (error) {
      if (error.permanent || attempt === attempts) throw error;
      const wait = Math.min(2000 * 2 ** (attempt - 1), 30000);
      console.warn(`[search-engine] Download attempt ${attempt}/${attempts} failed: ${error.message}; retrying in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
}
