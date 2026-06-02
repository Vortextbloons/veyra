export const MAX_IMAGE_ATTACHMENTS = 4;
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  /** data:image/...;base64,... */
  dataUrl: string;
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

export function isSupportedImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type);
}

export async function fileToAttachment(file: File): Promise<MessageAttachment> {
  if (!isSupportedImageFile(file)) {
    throw new Error("Only JPEG, PNG, and WebP images are supported.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image must be under ${MAX_IMAGE_BYTES / (1024 * 1024)} MB.`);
  }

  const dataUrl = await readFileAsDataUrl(file);
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type,
    dataUrl,
  };
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
    attachments?.filter((a) => a.mimeType.startsWith("image/")) ?? [];

  if (imageAttachments.length === 0) {
    return content;
  }

  const items: LmStudioInputItem[] = [];
  const text = content.trim();
  if (text) {
    items.push({ type: "text", content: text });
  }

  for (const attachment of imageAttachments) {
    items.push({ type: "image", data_url: attachment.dataUrl });
  }

  return items.length > 0 ? items : content;
}
