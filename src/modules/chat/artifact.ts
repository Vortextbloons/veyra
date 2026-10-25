export type ArtifactFormat = "html" | "code" | "document";

export type Artifact = {
  id: string;
  format: ArtifactFormat;
  title: string;
  content: string;
  language?: string;
  filename?: string;
  createdAt: number;
};

export type ArtifactNormalization =
  | { ok: true; artifact: Artifact }
  | { ok: false; error: string };

export const MAX_ARTIFACT_BYTES = 256 * 1024;

const MAX_TITLE_LENGTH = 120;
const MAX_FILENAME_LENGTH = 128;
const MAX_LANGUAGE_LENGTH = 40;

export function artifactByteLength(content: string): number {
  return new TextEncoder().encode(content).byteLength;
}

export function normalizeArtifact(
  raw: Record<string, unknown>,
  id: string,
  createdAt = Date.now(),
): ArtifactNormalization {
  const title = typeof raw.title === "string" ? raw.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: `Artifact titles must be 1–${MAX_TITLE_LENGTH} characters.` };
  }

  if (raw.format !== "html" && raw.format !== "code" && raw.format !== "document") {
    return { ok: false, error: "Choose HTML, code, or document format." };
  }

  if (typeof raw.content !== "string" || !raw.content.trim()) {
    return { ok: false, error: "Artifact content cannot be empty." };
  }
  if (artifactByteLength(raw.content) > MAX_ARTIFACT_BYTES) {
    return { ok: false, error: "Artifacts must be 256 KB or smaller. Nothing was truncated." };
  }

  const language = typeof raw.language === "string" ? raw.language.trim() : undefined;
  if (language && (language.length > MAX_LANGUAGE_LENGTH || !/^[a-zA-Z0-9_+#.-]+$/.test(language))) {
    return { ok: false, error: "The code language is invalid or too long." };
  }

  const filename = typeof raw.filename === "string" ? raw.filename.trim() : undefined;
  if (
    filename &&
    (filename.length > MAX_FILENAME_LENGTH ||
      filename === "." || filename === ".." ||
      /[\\/:\u0000-\u001f\u007f]/.test(filename))
  ) {
    return { ok: false, error: "Use a single safe filename without a folder path." };
  }

  return {
    ok: true,
    artifact: {
      id,
      format: raw.format,
      title,
      content: raw.content,
      language: language || undefined,
      filename: filename || undefined,
      createdAt,
    },
  };
}

export function summarizeArtifact(artifact: Artifact): string {
  const kind = artifact.format === "html"
    ? "HTML artifact"
    : artifact.format === "code"
      ? `${artifact.language || "Code"} file`
      : "Document";
  return `${kind}: ${artifact.title}. The finished output is attached to this message.`;
}

export function artifactDownloadName(artifact: Artifact): string {
  if (artifact.filename) return artifact.filename;

  const slug = artifact.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "artifact";

  if (artifact.format === "html") return `${slug}.html`;
  if (artifact.format === "document") return `${slug}.md`;

  const language = artifact.language?.toLowerCase() ?? "";
  const extensions: Record<string, string> = {
    bash: "sh", c: "c", cpp: "cpp", css: "css", dockerfile: "Dockerfile",
    go: "go", html: "html", java: "java", javascript: "js", js: "js",
    json: "json", jsx: "jsx", markdown: "md", md: "md", powershell: "ps1",
    py: "py", python: "py", rust: "rs", shell: "sh", sql: "sql",
    toml: "toml", ts: "ts", tsx: "tsx", typescript: "ts", xml: "xml",
    yaml: "yaml", yml: "yml",
  };
  const extension = extensions[language] ?? "txt";
  return extension === "Dockerfile" ? extension : `${slug}.${extension}`;
}

export function formatArtifactSize(byteLength: number): string {
  if (byteLength < 1024) return `${byteLength} B`;
  return `${(byteLength / 1024).toFixed(1)} KB`;
}
