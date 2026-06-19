export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_FILE_ATTACHMENTS = 10;
export const MAX_FILE_BYTES = 30 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export type AttachmentFileType = "image" | "text";

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  /** data:image/...;base64,... for images, empty for files */
  dataUrl: string;
  /** Extracted text content for non-image files */
  textContent?: string;
  /** Classification for rendering */
  fileType: AttachmentFileType;
  /** Original file size in bytes */
  size: number;
  /** Whether extracted text was truncated */
  truncated?: boolean;
}

/**
 * Normalizes an attachment loaded from persisted conversation data.
 * Old attachments may lack `fileType`, `size`, or `truncated`.
 */
export function normalizeAttachment(
  att: Partial<MessageAttachment> & { id: string; name: string; mimeType: string; dataUrl: string },
): MessageAttachment {
  return {
    ...att,
    fileType:
      att.fileType ??
      (att.mimeType.startsWith("image/") && SUPPORTED_IMAGE_TYPES.has(att.mimeType)
        ? "image"
        : "text"),
    size: att.size ?? 0,
  };
}

const VISION_MODEL_PATTERNS = [
  /\bvl\b/i,
  /\bvlm\b/i,
  /vision/i,
  /llava/i,
  /minicpm-v/i,
  /minicpm-o/i,
  /qwen2\.?5?-vl/i,
  /qwen3-vl/i,
  /qwen2-vl/i,
  /qwen3[._-]?5/i,
  /qwen-3[._-]?5/i,
  /gemma-3/i,
  /gemma[\s._-]?4/i,
  /pixtral/i,
  /moondream/i,
  /bakllava/i,
  /cogvlm/i,
  /internvl/i,
  /phi-3\.?5-vision/i,
  /phi-4-multimodal/i,
  /smolvlm/i,
  /llama-3\.2-vision/i,
  /llama-4/i,
  /granite-vision/i,
  /fuyu/i,
  /deepseek-vl/i,
  /aria/i,
  /chandra/i,
];

export function inferSupportsImages(modelId: string): boolean {
  const id = modelId.toLowerCase();
  return VISION_MODEL_PATTERNS.some((pattern) => pattern.test(id));
}

export function classifyFileType(file: File): AttachmentFileType {
  if (SUPPORTED_IMAGE_TYPES.has(file.type)) return "image";
  if (file.type.startsWith("image/")) {
    throw new Error(
      `Unsupported image format: ${file.type}. Only JPEG, PNG, and WebP are supported.`,
    );
  }
  return "text";
}

const BINARY_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/epub+zip",
]);

export function isBinaryDocument(mimeType: string): boolean {
  return BINARY_MIME_TYPES.has(mimeType);
}

export async function fileToAttachment(
  file: File,
  options?: { onExtracting?: (name: string) => void },
): Promise<MessageAttachment> {
  const fileType = classifyFileType(file);

  if (fileType === "image") {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error(
        `Image must be under ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`,
      );
    }
    const dataUrl = await readFileAsDataUrl(file);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || "image/unknown",
      dataUrl,
      fileType: "image",
      size: file.size,
    };
  }

  if (file.size > MAX_FILE_BYTES) {
    throw new Error(`File must be under ${MAX_FILE_BYTES / (1024 * 1024)} MB.`);
  }

  options?.onExtracting?.(file.name);
  const mimeType =
    !file.type || file.type === "application/octet-stream"
      ? guessMimeTypeFromName(file.name)
      : file.type;
  const isBinary = isBinaryDocument(mimeType);

  let textContent: string;
  let truncated = false;
  if (isBinary) {
    const result = await extractViaBackend(file, mimeType);
    textContent = result.text;
    truncated = result.truncated;
  } else {
    textContent = await readFileAsText(file);
    if (textContent.length > 300_000) {
      textContent = textContent.slice(0, 300_000);
      truncated = true;
    }
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType,
    dataUrl: "",
    textContent,
    fileType,
    size: file.size,
    truncated,
  };
}

function guessMimeTypeFromName(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    epub: "application/epub+zip",
    csv: "text/csv",
    tsv: "text/csv",
    json: "application/json",
    jsonl: "application/json",
    xml: "application/xml",
    html: "text/html",
    htm: "text/html",
    md: "text/markdown",
    markdown: "text/markdown",
    txt: "text/plain",
    log: "text/plain",
    py: "text/x-python",
    js: "text/javascript",
    ts: "text/typescript",
    jsx: "text/javascript",
    tsx: "text/typescript",
    rs: "text/x-rust",
    go: "text/x-go",
    java: "text/x-java",
    c: "text/x-c",
    h: "text/x-c",
    cpp: "text/x-c++",
    hpp: "text/x-c++",
    rb: "text/x-ruby",
    php: "text/x-php",
    swift: "text/x-swift",
    kt: "text/x-kotlin",
    sql: "text/x-sql",
    yaml: "text/x-yaml",
    yml: "text/x-yaml",
    toml: "text/x-toml",
    sh: "text/x-shellscript",
    bash: "text/x-shellscript",
    css: "text/css",
    scss: "text/css",
    less: "text/css",
    vue: "text/x-vue",
    svelte: "text/x-svelte",
    graphql: "text/x-graphql",
    gql: "text/x-graphql",
  };
  return map[ext] ?? "text/plain";
}

async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read file as text."));
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

export type FileExtractionResult = {
  text: string;
  truncated: boolean;
  charCount: number;
};

async function extractViaBackend(
  file: File,
  mimeType: string,
): Promise<FileExtractionResult> {
  const { invoke } = await import("@tauri-apps/api/core");
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  return await invoke<FileExtractionResult>("extract_file_text", {
    fileBytes: bytes,
    mimeType,
    fileName: file.name,
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to read image."));
    };
    reader.onerror = () => reject(new Error("Failed to read image."));
    reader.readAsDataURL(file);
  });
}

export type LmStudioInputItem =
  | { type: "text"; content: string }
  | { type: "image"; data_url: string };

export function buildLmStudioInput(
  content: string,
  attachments?: MessageAttachment[],
): string | LmStudioInputItem[] {
  const imageAttachments =
    attachments?.filter((a) => a.fileType === "image") ?? [];

  if (imageAttachments.length === 0) {
    return buildTextWithAttachments(content, attachments);
  }

  const items: LmStudioInputItem[] = [];
  const fullText = buildTextWithAttachments(content, attachments);
  const text = fullText.trim();
  if (text) {
    items.push({ type: "text", content: text });
  }

  for (const attachment of imageAttachments) {
    items.push({ type: "image", data_url: attachment.dataUrl });
  }

  return items.length > 0 ? items : content;
}

function buildTextWithAttachments(
  content: string,
  attachments?: MessageAttachment[],
): string {
  const fileAttachments =
    attachments?.filter((a) => a.fileType !== "image" && a.textContent) ?? [];
  if (fileAttachments.length === 0) return content;

  const parts: string[] = [];
  const text = content.trim();
  if (text) parts.push(text);

  for (const att of fileAttachments) {
    parts.push(
      `\n\n--- File: ${att.name} (${att.mimeType}) ---\n${att.textContent}\n--- End: ${att.name} ---`,
    );
  }

  return parts.join("");
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const codeExts = new Set([
    "py", "js", "ts", "jsx", "tsx", "rs", "go", "java", "c", "h",
    "cpp", "hpp", "rb", "php", "swift", "kt", "kts", "scala",
    "dart", "ex", "exs", "hs", "lua", "vim", "r",
  ]);
  const dataExts = new Set(["csv", "tsv", "json", "jsonl", "xml", "yaml", "yml", "toml"]);
  const docExts = new Set(["pdf", "docx", "xlsx", "pptx", "epub"]);
  const markupExts = new Set(["md", "markdown", "html", "htm", "vue", "svelte"]);

  if (codeExts.has(ext)) return "code";
  if (dataExts.has(ext)) return "data";
  if (docExts.has(ext)) return "document";
  if (markupExts.has(ext)) return "markup";
  if (ext === "sql") return "database";
  if (["sh", "bash", "zsh", "bat", "cmd"].includes(ext)) return "terminal";
  if (["css", "scss", "less"].includes(ext)) return "style";
  return "file";
}
