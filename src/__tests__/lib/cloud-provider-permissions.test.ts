/// <reference types="node" />
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cloud provider desktop permissions", () => {
  it("allows remote HTTPS fetches in the Tauri capability and CSP", () => {
    const capability = JSON.parse(
      readFileSync(resolve("src-tauri/capabilities/default.json"), "utf8"),
    ) as { permissions: Array<string | { identifier?: string; allow?: Array<{ url: string }> }> };
    const httpFetch = capability.permissions.find(
      (permission) => typeof permission === "object" && permission.identifier === "http:allow-fetch",
    );

    expect(typeof httpFetch === "object" ? httpFetch.allow : undefined).toContainEqual({ url: "https://**" });

    for (const file of ["src-tauri/tauri.conf.json", "src-tauri/tauri.dev.conf.json"]) {
      const config = JSON.parse(readFileSync(resolve(file), "utf8")) as { app: { security: { csp: string } } };
      expect(config.app.security.csp).toMatch(/connect-src[^;]*https:/);
    }
  });
});
