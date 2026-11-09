import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry } from './download.mjs';

test('retries a gateway timeout and interrupted body before succeeding', async () => {
  let calls = 0;
  const result = await fetchWithRetry('https://example.test', r => r.text(), {
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      if (calls === 1) return new Response('', { status: 504 });
      if (calls === 2) return { ok: true, text: async () => { throw new TypeError('terminated'); } };
      return new Response('archive');
    },
  });
  assert.equal(result, 'archive');
  assert.equal(calls, 3);
});

test('does not retry permanent HTTP failures', async () => {
  let calls = 0;
  await assert.rejects(fetchWithRetry('https://example.test', r => r.text(), {
    fetchImpl: async () => { calls++; return new Response('', { status: 404 }); },
  }), /404/);
  assert.equal(calls, 1);
});

test('stops after the retry limit', async () => {
  let calls = 0;
  await assert.rejects(fetchWithRetry('https://example.test', r => r.text(), {
    attempts: 3, sleep: async () => {},
    fetchImpl: async () => { calls++; throw new TypeError('network failure'); },
  }), /network failure/);
  assert.equal(calls, 3);
});
