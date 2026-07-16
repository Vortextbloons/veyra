import { describe, expect, it } from "vitest";
import {
  compareSemver,
  normalizeVersion,
  pickWindowsInstallerAsset,
} from "@/lib/app-update";

describe("app-update", () => {
  it("normalizes version tags", () => {
    expect(normalizeVersion(" v0.2.0 ")).toBe("0.2.0");
    expect(normalizeVersion("V1.0.1")).toBe("1.0.1");
  });

  it("compares semver values", () => {
    expect(compareSemver("0.2.0", "0.2.0")).toBe(0);
    expect(compareSemver("0.2.1", "0.2.0")).toBe(1);
    expect(compareSemver("0.2.0", "0.3.0")).toBe(-1);
    expect(compareSemver("1.0.0", "0.9.9")).toBe(1);
  });

  it("prefers Windows setup executables", () => {
    const asset = pickWindowsInstallerAsset([
      { name: "latest.json", browser_download_url: "https://example.com/latest.json" },
      { name: "Veyra_0.2.1_x64-setup.exe", browser_download_url: "https://example.com/setup.exe" },
      { name: "source.zip", browser_download_url: "https://example.com/source.zip" },
    ]);

    expect(asset?.name).toBe("Veyra_0.2.1_x64-setup.exe");
  });
});
