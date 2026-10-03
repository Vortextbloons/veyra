import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { createServer, type ViteDevServer } from "vite";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";

let server: ViteDevServer;
let browser: Browser;
let page: Page;
let url: string;

describe("Studio environment in a real sandboxed browser", () => {
  beforeAll(async () => {
    server = await createServer({ configFile: resolve("vite.config.ts"), cacheDir: resolve("node_modules/.vite-studio-tests"), server: { host: "127.0.0.1", port: 0, strictPort: false, warmup: { clientFiles: [] } }, clearScreen: false, plugins: [{
      name: "studio-test-fixture",
      configureServer(vite) {
        vite.middlewares.use("/__studio-test", async (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(await vite.transformIndexHtml("/__studio-test", '<html><head></head><body><div id="root"></div><script type="module" src="/src/__tests__/fixtures/studio-environment-preview.tsx"></script></body></html>'));
        });
      },
    }] });
    await server.listen();
    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("Missing test server address");
    url = `http://127.0.0.1:${address.port}/__studio-test`;
    try { browser = await chromium.launch({ headless: true }); }
    catch { browser = await chromium.launch({ channel: "msedge", headless: true }); }
  }, 30_000);

  beforeEach(async () => {
    await page?.close();
    page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript(() => {
      // Simulate Tauri storage in this disposable browser context only.
      Object.assign(window, { __TAURI_INTERNALS__: { invoke: async (command: string) => command === "load_or_create_conversation_key" ? btoa("\0".repeat(32)) : null } });
    });
    await page.goto(url);
    await page.locator('iframe[aria-hidden="false"]').waitFor();
  }, 20_000);

  afterAll(async () => { await browser?.close(); await server?.close(); });

  it("renders the environment as the primary surface and exposes conversation on demand", async () => {
    expect(await page.locator('#studio-conversation').count()).toBe(0);
    const frame = page.frameLocator('iframe[aria-hidden="false"]');
    expect(await frame.getByRole("heading", { name: "Where the budget goes" }).count()).toBe(1);
    expect(await frame.getByRole("button", { name: "Hosting: 42" }).count()).toBe(1);
    if (process.env.STUDIO_SCREENSHOT_DIR) {
      await page.waitForFunction(() => { const frame = document.querySelector('iframe[aria-hidden="false"]'); return frame && getComputedStyle(frame).opacity === "1"; });
      await mkdir(process.env.STUDIO_SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({ path: resolve(process.env.STUDIO_SCREENSHOT_DIR, "studio-environment.png") });
    }
    await page.getByRole("button", { name: "Conversation", exact: true }).click();
    expect(await page.locator('#studio-conversation').count()).toBe(1);
    expect(await page.locator('#studio-conversation iframe').count()).toBe(0);
    await page.getByRole("button", { name: "Close conversation" }).click();
    expect(await page.locator('#studio-conversation').count()).toBe(0);
  });

  it("persists controls and chart selection across replacement without reloading on state changes", async () => {
    const frame = page.frameLocator('iframe[aria-hidden="false"]');
    await frame.getByRole("button", { name: "Tools: 28" }).click();
    await frame.getByRole("slider", { name: "Scenario" }).press("End");
    await frame.getByRole("slider", { name: "Scenario" }).press("ArrowLeft");
    await expect.poll(() => page.evaluate(() => window.studioTest.store.getState().conversations[0]?.studioEnvironment?.state.$controls)).toEqual({ scenario: "99" });
    expect(await frame.locator("body").evaluate(() => (window as Window & { renderCount?: number }).renderCount)).toBe(1);
    await page.evaluate(() => window.studioTest.commit());
    await page.waitForFunction(() => window.studioTest.store.getState().conversations[0]?.studioEnvironment?.feedback?.revision === 2);
    expect(await page.frameLocator('iframe[aria-hidden="false"]').getByRole("slider", { name: "Scenario" }).inputValue()).toBe("99");
    const state = await page.evaluate(() => window.studioTest.store.getState().conversations[0]?.studioEnvironment);
    expect(state?.lastEvent?.name).toBe("chart.select");
    expect(state?.state.chartSelection).toMatchObject({ label: "Tools", value: 28 });
    expect(await page.frameLocator('iframe[aria-hidden="false"]').locator('#selection').textContent()).toBe("Tools: 28");
    expect(JSON.stringify(state)).not.toContain("secret");
  });

  it("retains the last working frame when the next script fails and supports undo", async () => {
    await page.evaluate(() => window.studioTest.commit("throw new Error('Chart initialization failed');"));
    await page.getByText("Chart initialization failed", { exact: true }).waitFor();
    expect(await page.frameLocator('iframe[aria-hidden="false"]').getByRole("heading", { name: "Where the budget goes" }).count()).toBe(1);
    await page.evaluate(() => window.studioTest.commit());
    await page.waitForFunction(() => window.studioTest.store.getState().conversations[0]?.studioEnvironment?.feedback?.revision === 3);
    await page.getByRole("button", { name: "Undo environment change" }).click();
    // Undo skips a known failed version; it remains available in history.
    await page.waitForFunction(() => window.studioTest.store.getState().conversations[0]?.studioEnvironment?.selection?.revision === 1);
    expect(await page.locator('iframe[aria-hidden="false"]').count()).toBe(1);
  });

  it("updates exactly one region, preserves facts, and rejects unsafe merged HTML", async () => {
    const good = await page.evaluate(() => window.studioTest.update("chart", '<div id="chart">A new perspective</div>'));
    expect(good.parsed).toMatchObject({ ok: true, value: { data: { values: [42, 28, 30] } } });
    expect(good.validated?.ok).toBe(true);
    const bad = await page.evaluate(() => window.studioTest.update("chart", '<img src="https://example.com/tracker">'));
    expect(bad.validated).toMatchObject({ ok: false, issues: [{ code: "blocked_url" }] });
    expect((await page.evaluate(() => window.studioTest.update("missing", "<p>x</p>"))).parsed).toMatchObject({ ok: false });
  });

  it("feeds script failures back for one bounded repair attempt", async () => {
    const first = await page.evaluate(() => window.studioTest.run("throw new Error('Broken chart');"));
    expect(first).toContain("Return one complete corrected payload");
    const second = await page.evaluate(() => window.studioTest.run("throw new Error('Still broken');"));
    expect(second).toContain("Repair already failed");
    const final = await page.evaluate(() => window.studioTest.run("document.body.textContent='Should not run';"));
    expect(final).toContain("ignored");
    expect(await page.frameLocator('iframe[aria-hidden="false"]').getByRole("heading", { name: "Where the budget goes" }).count()).toBe(1);
  });

  it("opens conversation when a tool needs an answer and keeps Stop accessible", async () => {
    await page.evaluate(() => window.studioTest.ask());
    await page.getByText("Which scenario should we explore?", { exact: true }).waitFor({ timeout: 2000 });
    expect(await page.getByRole("button", { name: "Close conversation" }).isDisabled()).toBe(true);
    await page.getByRole("button", { name: "Stop", exact: true }).click({ timeout: 2000 });
    expect(await page.evaluate(() => window.studioTest.store.getState().streamingBuffer)).toBeNull();
  });

  it("recovers an earlier usable view when reopening a failed latest version", async () => {
    await page.evaluate(() => window.studioTest.commit("throw new Error('Cannot load latest');"));
    await page.getByText("Cannot load latest", { exact: true }).waitFor();
    // Remount the real surface, without resetting the synthetic conversation.
    await page.evaluate(() => window.studioTest.store.setState({ activeConversationId: null }));
    await page.evaluate(() => window.studioTest.store.setState({ activeConversationId: "fixture" }));
    await page.getByText("Cannot load latest", { exact: true }).waitFor();
    await page.locator('iframe[aria-hidden="false"]').waitFor();
    expect(await page.frameLocator('iframe[aria-hidden="false"]').getByRole("heading", { name: "Where the budget goes" }).count()).toBe(1);
  });

  it("ignores spoofed bridge messages and renders at narrow widths", async () => {
    await page.evaluate(() => window.postMessage({ channel: "fake", type: "state", state: { compromised: true } }, "*"));
    expect(await page.evaluate(() => window.studioTest.store.getState().conversations[0]?.studioEnvironment?.state.compromised)).toBeUndefined();
    await page.setViewportSize({ width: 560, height: 760 });
    expect(await page.locator('iframe[aria-hidden="false"]').count()).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  it("exports self-contained data and state without a host connection", async () => {
    const exported = await page.evaluate(() => window.studioTest.buildStudioDocument({ title: "Portable", html: '<output id="value"></output>', css: "", data: { value: 42 }, state: { selected: "Tools" }, javascript: "document.querySelector('#value').textContent=studio.data.value+':'+studio.getState().selected;" }));
    const standalone = await browser.newPage();
    try {
      await standalone.setContent(exported);
      expect(await standalone.locator('#value').textContent()).toBe("42:Tools");
    } finally { await standalone.close(); }
  });
});
