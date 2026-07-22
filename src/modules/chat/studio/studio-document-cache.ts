import { buildStudioDocument } from "./studio-document-builder";

const cache = new Map<string, string>();

export function getCachedStudioDocument(input: {
  artifactId: string;
  revision: number;
  title: string;
  html: string;
  css: string;
  reducedMotion: boolean;
}): string {
  const key = `${input.artifactId}:${input.revision}:${input.reducedMotion ? "rm" : "full"}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const document = buildStudioDocument({
    title: input.title,
    html: input.html,
    css: input.css,
    reducedMotion: input.reducedMotion,
  });
  cache.set(key, document);
  if (cache.size > 48) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  return document;
}

export function clearStudioDocumentCache(): void {
  cache.clear();
}
