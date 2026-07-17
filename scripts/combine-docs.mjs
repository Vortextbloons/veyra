#!/usr/bin/env node

/**
 * combine-docs.mjs
 *
 * Combines all project documentation into a single markdown file.
 * Usage: node scripts/combine-docs.mjs [output-path]
 *
 * Default output: docs/ALL.md
 *
 * The script:
 * 1. Reads docs/INDEX.md to get the canonical order of doc folders
 * 2. Discovers all .md files in each listed folder (not just README)
 * 3. Reads all files
 * 4. Writes the combined file with TOC and section headers
 */

import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join, relative, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const DOCS_DIR = resolve(REPO_ROOT, "docs");
const INDEX_PATH = resolve(DOCS_DIR, "INDEX.md");
const DEFAULT_OUTPUT = resolve(DOCS_DIR, "ALL.md");

const outputPath = process.argv[2]
  ? resolve(REPO_ROOT, process.argv[2])
  : DEFAULT_OUTPUT;

// Files excluded from the combined output
const EXCLUDED = new Set([
  "AI_DOCS_UPDATE_PROMPT.md",
  "VEYRA_FULL_DOCS.md",
  "ALL.md",
  "INDEX.md",
]);

/**
 * Extract folder paths from INDEX.md.
 * Looks for markdown links pointing to subfolder files (e.g., [overview/README.md](overview/README.md))
 * and extracts the folder portion. Root-level files are skipped.
 */
function extractFolders(indexContent) {
  const folders = [];
  const linkRegex = /\[[^\]]*\]\(([^)]+\.md)\)/g;
  let match;
  while ((match = linkRegex.exec(indexContent)) !== null) {
    const relPath = match[1];
    const parts = relPath.split("/");
    // Only include subfolder paths like "overview/README.md"
    // Skip root-level files like "AI_DOCS_UPDATE_PROMPT.md"
    if (parts.length < 2) continue;
    const folder = parts.slice(0, -1).join("/");
    if (!folders.includes(folder)) {
      folders.push(folder);
    }
  }
  return folders;
}

/**
 * Discover all .md files in a folder, sorted alphabetically.
 * Skips EXCLUDED files.
 */
function discoverFiles(folder) {
  const folderPath = folder ? join(DOCS_DIR, folder) : DOCS_DIR;
  if (!existsSync(folderPath) || !statSync(folderPath).isDirectory()) {
    return [];
  }

  const entries = readdirSync(folderPath);
  return entries
    .filter((f) => {
      if (extname(f) !== ".md") return false;
      if (EXCLUDED.has(f)) return false;
      return true;
    })
    .sort()
    .map((f) => (folder ? `${folder}/${f}` : f));
}

/**
 * Read a single doc file. Returns null if missing.
 */
function readDocFile(relativePath) {
  const fullPath = resolve(DOCS_DIR, relativePath);
  if (!existsSync(fullPath)) {
    console.warn(`  Warning: ${relativePath} not found, skipping`);
    return null;
  }
  const content = readFileSync(fullPath, "utf-8");
  return { relativePath, content };
}

function readFolderFiles(filePaths) {
  return filePaths.map(readDocFile).filter(Boolean);
}

function formatSection(doc) {
  const name = doc.relativePath.replace(/\//g, " > ").replace(/\.md$/, "");
  return `---\n\n# ${name}\n\n> Source: \`docs/${doc.relativePath}\`\n\n`;
}

function tocAnchor(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+$/, "");
}

async function main() {
  console.log("Documentation Combiner");
  console.log("======================\n");

  if (!existsSync(INDEX_PATH)) {
    console.error("Error: docs/INDEX.md not found");
    process.exit(1);
  }

  const indexContent = readFileSync(INDEX_PATH, "utf-8");
  const folders = extractFolders(indexContent);

  console.log(`Found ${folders.length} doc sections in INDEX.md\n`);

  // Discover all files per folder
  const folderFileMap = new Map();
  let totalFiles = 0;

  for (const folder of folders) {
    const files = discoverFiles(folder);
    folderFileMap.set(folder, files);
    totalFiles += files.length;
    const label = folder || "(root)";
    console.log(`  ${label}: ${files.length} file(s)`);
  }

  console.log(`\nTotal: ${totalFiles} files\n`);

  // Read all files in parallel (all folders at once)
  const allFileSets = folders.map((folder) =>
    readFolderFiles(folderFileMap.get(folder)),
  );

  // Build output
  const sections = [];

  // Header
  sections.push(`# Veyra — Complete Documentation\n`);
  sections.push(
    `> Auto-generated from docs/INDEX.md by scripts/combine-docs.mjs\n`
  );
  sections.push(`> Generated: ${new Date().toISOString()}\n`);
  sections.push(`> Total files: ${totalFiles}\n\n`);
  sections.push(`## Table of Contents\n\n`);

  // TOC
  for (let i = 0; i < folders.length; i++) {
    const folder = folders[i];
    const files = allFileSets[i];
    const sectionName = folder || "root";
    const anchor = tocAnchor(sectionName);
    sections.push(`- [${sectionName}](#${anchor})\n`);
    for (const doc of files) {
      const fileName = basename(doc.relativePath, ".md");
      const fileAnchor = tocAnchor(
        `${sectionName} > ${fileName}`
      );
      sections.push(`  - [${fileName}](#${fileAnchor})\n`);
    }
  }
  sections.push("\n");

  // Documents
  let found = 0;

  for (let i = 0; i < folders.length; i++) {
    const files = allFileSets[i];
    for (const doc of files) {
      sections.push(formatSection(doc));
      sections.push(doc.content.trim());
      sections.push("\n\n");
      found++;
      console.log(`  ✓ ${doc.relativePath}`);
    }
  }

  const combined = sections.join("");
  writeFileSync(outputPath, combined, "utf-8");

  const sizeKB = (Buffer.byteLength(combined) / 1024).toFixed(1);
  console.log(`\nDone!`);
  console.log(`  Found: ${found}`);
  console.log(`  Output: ${outputPath}`);
  console.log(`  Size: ${sizeKB} KB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
