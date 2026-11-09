import RELEASE_SYNC from "@jitl/quickjs-wasmfile-release-sync";
import { beforeAll, describe, expect, it } from "vitest";
import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from "quickjs-emscripten-core";
import { executeSandbox } from "@/lib/code-execution/sandbox";

let module: QuickJSWASMModule;
beforeAll(async () => { module = await newQuickJSWASMModuleFromVariant(RELEASE_SYNC); });
const run = (code: string, input: unknown = null) => executeSandbox(module, code, JSON.stringify(input));

describe("JavaScript Wasm sandbox", () => {
  it("returns calculations and captured console output", () => {
    expect(run('console.log("sum", 2 + 3); return { total: 5 };')).toEqual({ logs: ["sum 5"], result: { total: 5 } });
  });
  it("transforms supplied file contents without filesystem access", () => {
    expect(run('return input.trim().split("\\n").map(Number).reduce((a,b) => a+b, 0);', "1\n2\n3")).toEqual({ logs: [], result: 6 });
  });
  it("does not expose browser, Node, Tauri, or networking APIs", () => {
    expect(run('return [typeof fetch, typeof process, typeof require, typeof window, typeof document, typeof __TAURI_INTERNALS__, typeof postMessage];').result).toEqual(Array(7).fill("undefined"));
    expect(() => run('return require("fs");')).toThrow();
  });
  it("starts each execution with fresh state", () => {
    run('globalThis.secret = 123;');
    expect(run('return typeof secret;').result).toBe("undefined");
  });
  it("reports syntax and runtime errors", () => {
    expect(() => run('return (')).toThrow();
    expect(() => run('throw new Error("bad input");')).toThrow("bad input");
  });
  it("rejects oversized results, console floods, and async results", () => {
    expect(() => run('return "x".repeat(60001);')).toThrow("Output limit");
    expect(() => run('for(let i=0;i<1001;i++) console.log(i);')).toThrow("output limit");
    expect(() => run('return Promise.resolve(1);')).toThrow("Async code");
  });
  it("interrupts an infinite loop", () => {
    expect(() => run('while (true) {}')).toThrow();
  }, 10_000);
  it("limits guest memory", () => {
    expect(() => run('const data = []; while(true) data.push(new Array(100000).fill(1));')).toThrow();
  });
});
