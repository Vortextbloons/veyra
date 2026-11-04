import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createHash } from "node:crypto";

const source = fileURLToPath(new URL("./pi/", import.meta.url));
const target = fileURLToPath(new URL("../src-tauri/resources/pi/", import.meta.url));
const fingerprint = createHash("sha256").update(readFileSync(join(source, "package-lock.json"))).update(process.version).update(process.platform).update(process.arch).digest("hex");
mkdirSync(target, { recursive: true });
const marker = join(target, ".prepared");
if (!existsSync(marker) || readFileSync(marker, "utf8") !== fingerprint || !existsSync(join(target, process.platform === "win32" ? "node.exe" : "node")) || !existsSync(join(target, "node_modules/@earendil-works/pi-coding-agent/dist/cli.js"))) {
  for (const file of ["package.json", "package-lock.json"]) copyFileSync(join(source, file), join(target, file));
  const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--omit=dev", "--no-audit", "--no-fund"], { cwd: target, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) throw new Error("Could not prepare bundled Pi dependencies");
  copyFileSync(process.execPath, join(target, process.platform === "win32" ? "node.exe" : "node"));
  if (process.platform !== "win32") chmodSync(join(target, "node"), 0o755);
  writeFileSync(marker, fingerprint);
}
