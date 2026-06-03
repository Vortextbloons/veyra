import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");

const { version } = JSON.parse(readFileSync(join(root, "version.json"), "utf8"));
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`[sync-version] Invalid semver in version.json: ${version}`);
  process.exit(1);
}

const targets = [
  {
    path: join(root, "package.json"),
    read: (text) => JSON.parse(text).version,
    write: (text) => {
      const data = JSON.parse(text);
      data.version = version;
      return `${JSON.stringify(data, null, 2)}\n`;
    },
  },
  {
    path: join(root, "src-tauri", "Cargo.toml"),
    read: (text) => text.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
    write: (text) => text.replace(/^version\s*=\s*"[^"]+"/m, `version = "${version}"`),
  },
  {
    path: join(root, "src-tauri", "tauri.conf.json"),
    read: (text) => JSON.parse(text).version,
    write: (text) => {
      const data = JSON.parse(text);
      data.version = version;
      return `${JSON.stringify(data, null, 2)}\n`;
    },
  },
  {
    path: join(root, "src-tauri", "tauri.dev.conf.json"),
    read: (text) => JSON.parse(text).version,
    write: (text) => {
      const data = JSON.parse(text);
      data.version = version;
      return `${JSON.stringify(data, null, 2)}\n`;
    },
  },
];

let failed = false;

for (const target of targets) {
  const text = readFileSync(target.path, "utf8");
  const current = target.read(text);

  if (current === undefined || current === null) {
    console.error(`[sync-version] Could not read version from ${target.path}`);
    failed = true;
    continue;
  }

  if (checkOnly) {
    if (current !== version) {
      console.error(
        `[sync-version] Mismatch in ${target.path}: expected ${version}, found ${current}`,
      );
      failed = true;
    }
    continue;
  }

  if (current === version) {
    console.log(`[sync-version] ${target.path} already at ${version}`);
    continue;
  }

  writeFileSync(target.path, target.write(text), "utf8");
  console.log(`[sync-version] ${target.path}: ${current} -> ${version}`);
}

if (failed) {
  process.exit(1);
}

if (checkOnly) {
  console.log(`[sync-version] All targets match ${version}`);
}
