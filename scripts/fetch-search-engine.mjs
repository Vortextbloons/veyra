#!/usr/bin/env node
/**
 * Downloads the pinned DonSeTch release that Veyra bundles as its local search
 * engine, plus the rerank model so the first search does not need to download
 * 23 MB from Hugging Face.
 *
 * The artifact is intentionally not committed. Run this once after cloning and
 * before `npm run dev:app` / `npm run build:app`; both scripts also call it.
 *
 * Usage:
 *   node scripts/fetch-search-engine.mjs [--force]
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const TARGET = path.join(ROOT, "src-tauri", "resources", "search-engine");
const VERSION = "4.10.1";
const COMMIT = "3169d2d";
const REPO = "https://github.com/dondai44423/donsetch";

const MODEL_URL =
  "https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2/resolve/main/onnx/model_quantized.onnx";
const MODEL_SHA256 =
  "e9d8ebf845c413e981c175bfe49a3bfa9b3dcce2a3ba54875ee5df5a58639fbe";
const TOKENIZER_URL =
  "https://huggingface.co/Xenova/ms-marco-MiniLM-L-6-v2/resolve/main/tokenizer.json";
const TOKENIZER_SHA256 =
  "d241a60d5e8f04cc1b2b3e9ef7a4921b27bf526d9f6050ab90f9267a1f9e5c66";

const PLATFORM_ASSETS = {
  "win32-x64": {
    asset: "donsetch-win32-x64.tar.gz",
    sha256: "5cd1cbc6c5352aa913a3b7bf595792f2b189b53adfbfd41115d1e3e4aaa11f20",
    binary: "donsetch.exe",
  },
  "darwin-arm64": {
    asset: "donsetch-darwin-arm64.tar.gz",
    binary: "donsetch",
  },
  "darwin-x64": {
    asset: "donsetch-darwin-x64.tar.gz",
    binary: "donsetch",
  },
  "linux-x64": {
    asset: "donsetch-linux-x64.tar.gz",
    binary: "donsetch",
  },
  "linux-arm64": {
    asset: "donsetch-linux-arm64.tar.gz",
    binary: "donsetch",
  },
};

const force = process.argv.includes("--force");
const platformKey = `${process.platform}-${process.arch}`;
const platform = PLATFORM_ASSETS[platformKey];

function log(message) {
  process.stdout.write(`[search-engine] ${message}\n`);
}

async function sha256(file) {
  return createHash("sha256").update(await readFile(file)).digest("hex");
}

async function download(url, destination, expectedSha256) {
  const response = await fetch(url, {
    headers: { "User-Agent": "Veyra-build" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (expectedSha256 && actual !== expectedSha256) {
    throw new Error(
      `Checksum mismatch for ${url}\n  expected ${expectedSha256}\n  actual   ${actual}`,
    );
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return actual;
}

async function releaseSha256(asset) {
  const response = await fetch(`${REPO}/releases/download/v${VERSION}/${asset}.sha256`, {
    headers: { "User-Agent": "Veyra-build" },
    redirect: "follow",
  });
  if (!response.ok) {
    throw new Error(`Could not read release checksum for ${asset}: HTTP ${response.status}`);
  }
  return (await response.text()).trim().split(/\s+/)[0];
}

async function ensureModel(directory, url, filename, expectedSha256) {
  const destination = path.join(directory, filename);
  if (!force && existsSync(destination)) {
    return;
  }
  log(`Downloading ${filename}…`);
  await download(url, destination, expectedSha256);
}

async function main() {
  if (!platform) {
    throw new Error(
      `No pinned DonSeTch release for ${platformKey}. Add it to PLATFORM_ASSETS or build for Windows.`,
    );
  }

  const versionFile = path.join(TARGET, "VERSION");
  const binaryFile = path.join(TARGET, platform.binary);
  const required = [
    binaryFile,
    versionFile,
    path.join(TARGET, "LICENSE"),
    path.join(TARGET, "SOURCE-OFFER.txt"),
    path.join(TARGET, "rerank", "model_quantized.onnx"),
    path.join(TARGET, "rerank", "tokenizer.json"),
  ];
  if (platform.binary.endsWith(".exe")) {
    required.push(path.join(TARGET, "pdfium.dll"), path.join(TARGET, "onnxruntime.dll"));
  }
  if (
    !force &&
    required.every((file) => existsSync(file)) &&
    (await readFile(versionFile, "utf8")).trim() === VERSION
  ) {
    log(`Already present (v${VERSION}).`);
    return;
  }

  await mkdir(TARGET, { recursive: true });
  const temp = await mkdtemp(path.join(os.tmpdir(), "veyra-search-engine-"));
  try {
    const archive = path.join(temp, platform.asset);
    log(`Downloading DonSeTch v${VERSION} (${platformKey})…`);
    const expected = platform.sha256 ?? (await releaseSha256(platform.asset));
    await download(
      `${REPO}/releases/download/v${VERSION}/${platform.asset}`,
      archive,
      expected,
    );

    log("Extracting…");
    const extracted = spawnSync("tar", ["-xzf", archive, "-C", TARGET], {
      stdio: "inherit",
    });
    if (extracted.status !== 0) {
      throw new Error("Could not extract the DonSeTch archive (tar failed).");
    }
    if (process.platform !== "win32") {
      await chmod(binaryFile, 0o755);
    }

    const license = path.join(temp, "LICENSE");
    await download(`${REPO}/raw/v${VERSION}/LICENSE`, license);
    await copyFile(license, path.join(TARGET, "LICENSE"));

    await writeFile(
      path.join(TARGET, "SOURCE-OFFER.txt"),
      [
        `DonSeTch v${VERSION} (git ${COMMIT})`,
        `Copyright (c) 2026 Bishesh Bhandari`,
        `Licensed under the GNU Affero General Public License v3.0.`,
        ``,
        `Corresponding source for this exact release:`,
        `  ${REPO}/tree/v${VERSION}`,
        ``,
        `This copy is unmodified. Veyra runs it as a separate process and does`,
        `not link against it. If Veyra ever patches the engine, the patch must`,
        `also be published under the AGPL-3.0.`,
        ``,
        `Third-party components shipped beside the engine:`,
        `  - ONNX Runtime (MIT): https://github.com/microsoft/onnxruntime`,
        `  - PDFium (BSD-3-Clause): https://pdfium.googlesource.com/pdfium/`,
        ``,
      ].join("\n"),
    );

    await ensureModel(
      path.join(TARGET, "rerank"),
      MODEL_URL,
      "model_quantized.onnx",
      MODEL_SHA256,
    );
    await ensureModel(
      path.join(TARGET, "rerank"),
      TOKENIZER_URL,
      "tokenizer.json",
      TOKENIZER_SHA256,
    );

    await writeFile(versionFile, `${VERSION}\n`);
    log(`Ready: ${TARGET}`);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[search-engine] ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
