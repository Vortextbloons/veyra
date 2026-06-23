import { readdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const docsDir = join(__dirname, "..", "docs");
const outputFile = join(docsDir, "VEYRA_FULL_DOCS.md");

async function findMarkdownFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.name.endsWith(".md") && entry.name !== "VEYRA_FULL_DOCS.md" && entry.name !== "UPDATING.md") {
      files.push(fullPath);
    }
  }

  return files;
}

async function combineDocs() {
  const files = (await findMarkdownFiles(docsDir)).sort((a, b) => {
    const relA = relative(docsDir, a);
    const relB = relative(docsDir, b);
    return relA.localeCompare(relB);
  });

  if (files.length === 0) {
    console.log("No markdown files found in docs/");
    process.exit(1);
  }

  const separator = "\n\n---\n\n";
  const parts = [];

  for (const file of files) {
    const content = await readFile(file, "utf-8");
    const rel = relative(docsDir, file);
    console.log(`  + ${rel}`);
    parts.push(content.trim());
  }

  const combined = parts.join(separator);

  await writeFile(outputFile, combined, "utf-8");
  console.log(`Combined ${files.length} files into VEYRA_FULL_DOCS.md`);
}

combineDocs().catch((err) => {
  console.error(err);
  process.exit(1);
});
