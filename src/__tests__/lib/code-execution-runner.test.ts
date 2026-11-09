import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runJavaScript } from "@/lib/code-execution/runner";

class FakeWorker {
  static latest: FakeWorker;
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { FakeWorker.latest = this; }
}

beforeEach(() => { vi.stubGlobal("Worker", FakeWorker); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("JavaScript worker lifecycle", () => {
  it("returns results and terminates the worker", async () => {
    const result = runJavaScript({ code: "return input;", input: "file contents" }, new AbortController().signal);
    const worker = FakeWorker.latest;
    expect(worker.postMessage).toHaveBeenCalledWith({ code: "return input;", inputJson: '"file contents"' });
    worker.onmessage?.({ data: { result: { logs: [], result: "file contents" } } });
    await expect(result).resolves.toEqual({ logs: [], result: "file contents" });
    expect(worker.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("terminates immediately when the chat is cancelled", async () => {
    const controller = new AbortController();
    const result = runJavaScript({ code: "while(true) {}" }, controller.signal);
    controller.abort();
    await expect(result).rejects.toThrow("cancelled");
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("terminates workers that never reply", async () => {
    const result = runJavaScript({ code: "return 1;" }, new AbortController().signal);
    const assertion = expect(result).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10_000);
    await assertion;
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
  it("cleans up startup failures", async () => {
    const result = runJavaScript({ code: "return 1;" }, new AbortController().signal);
    FakeWorker.latest.onerror?.();
    await expect(result).rejects.toThrow("Could not start");
    expect(FakeWorker.latest.terminate).toHaveBeenCalledOnce();
  });
  it("rejects empty and oversized input before starting", async () => {
    await expect(runJavaScript({ code: "" }, new AbortController().signal)).rejects.toThrow("required");
    await expect(runJavaScript({ code: "return input;", input: "x".repeat(1_000_000) }, new AbortController().signal)).rejects.toThrow("limit");
  });
});
