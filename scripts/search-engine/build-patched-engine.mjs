// DonSeTch and the accompanying patch are AGPL-3.0-only. Keep the engine
// separate from Veyra and bundle its complete patched source with the binary.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const PATCH = fileURLToPath(new URL("adaptive-recall.patch", import.meta.url));
const SOURCE_COMMIT = "3169d2d3e8e426ec0c0eca5cac15c05d83dcdc6f";
const FEATURES = "ocr,rerank,http";

async function digest(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

function run(command, args, cwd, capture = false) {
  const result = spawnSync(command, args, {
    cwd,
    windowsHide: true,
    stdio: capture ? "pipe" : "inherit",
    encoding: "utf8",
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      `Patched search engine: ${command} failed. ${result.error?.message ?? result.stderr ?? "See output above."}`,
    );
  }
  return result.stdout?.trim();
}

export async function isPatchedEngineCurrent(target, binary) {
  try {
    const stamp = JSON.parse(await readFile(path.join(target, "VEYRA-BUILD.json"), "utf8"));
    return stamp.sourceCommit === SOURCE_COMMIT &&
      stamp.patchSha256 === await digest(PATCH) &&
      stamp.binarySha256 === await digest(path.join(target, binary)) &&
      existsSync(path.join(target, "SOURCE.tar.gz"));
  } catch {
    return false;
  }
}

export async function buildPatchedSearchEngine(target, binary, repo, version) {
  const patchSha256 = await digest(PATCH);
  // BoringSSL's NASM build cannot handle spaces in its output path on Windows.
  // Keep native intermediates outside a checkout such as "Desktop Apps".
  const workspaceKey = createHash("sha256").update(ROOT).digest("hex").slice(0, 12);
  const cache = process.env.VEYRA_SEARCH_BUILD_DIR ?? (process.platform === "win32"
    ? path.join(tmpdir(), `veyra-search-engine-${workspaceKey}`)
    : path.join(ROOT, "src-tauri", "target", "search-engine"));
  const source = path.join(cache, `source-${patchSha256.slice(0, 16)}`);
  const build = path.join(cache, "build");
  await mkdir(cache, { recursive: true });
  if (!existsSync(path.join(source, ".git"))) {
    run("git", ["-c", "core.autocrlf=false", "clone", "--depth", "1", "--branch", `v${version}`, repo, source], ROOT);
  }
  if (run("git", ["rev-parse", "HEAD"], source, true) !== SOURCE_COMMIT) {
    throw new Error("Search engine source does not match the pinned commit.");
  }
  const applied = path.join(source, ".veyra-patch");
  if (!existsSync(applied)) {
    run("git", ["apply", "--check", PATCH], source);
    run("git", ["apply", PATCH], source);
    await writeFile(applied, patchSha256);
  }
  // The Windows release archive is checksum-verified by the caller and already
  // contains this runtime. Seed upstream's supported vendor cache so its build
  // script does not download the same dependency again from GitHub.
  if (process.platform === "win32") {
    const onnx = path.join(source, "vendor", "onnx");
    await mkdir(onnx, { recursive: true });
    await copyFile(path.join(target, "onnxruntime.dll"), path.join(onnx, "onnxruntime.dll"));
  }
  console.log("[search-engine] Building adaptive recall (first build requires Rust, CMake, NASM and libclang)...");
  run("cargo", ["build", "--release", "--locked", "--features", FEATURES, "--target-dir", build], source);
  if (await digest(PATCH) !== patchSha256) {
    throw new Error("Search engine patch changed during its build; run the fetch script again.");
  }
  // The full corresponding source travels with every distributed binary.
  // Cargo.lock pins the dependencies, including the external quiche source.
  run("tar", ["-czf", path.join(target, "SOURCE.tar.gz"), "--exclude=.git", "--exclude=.veyra-patch", "-C", source, "."], ROOT);
  await copyFile(path.join(build, "release", binary), path.join(target, binary));
  await copyFile(PATCH, path.join(target, "adaptive-recall.patch"));
  await writeFile(path.join(target, "VEYRA-BUILD.json"), JSON.stringify({
    sourceCommit: SOURCE_COMMIT,
    patchSha256,
    binarySha256: await digest(path.join(target, binary)),
    features: FEATURES,
    profile: "release",
  }, null, 2) + "\n");
}
