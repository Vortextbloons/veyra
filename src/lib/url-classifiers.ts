export function isYouTubeUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host === "youtube.com" ||
      host === "www.youtube.com" ||
      host === "m.youtube.com" ||
      host === "music.youtube.com" ||
      host === "youtu.be"
    );
  } catch {
    return false;
  }
}

export function isPdfUrl(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return path.endsWith(".pdf") || path.includes(".pdf/");
  } catch {
    return /\.pdf(?:[?#]|$)/i.test(url);
  }
}

export function isDocxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".docx") || lower.includes("officedocument.wordprocessingml");
}

export function isPptxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".pptx") || lower.includes("officedocument.presentationml");
}

export function isXlsxUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return lower.includes(".xlsx") || lower.includes("officedocument.spreadsheetml");
}

export function isEpubUrl(url: string): boolean {
  return url.toLowerCase().includes(".epub");
}

export function isArxivUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "arxiv.org" || host.endsWith(".arxiv.org");
  } catch {
    return /arxiv\.org/i.test(url);
  }
}

export function isWikipediaUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(".wikipedia.org");
  } catch {
    return /wikipedia\.org/i.test(url);
  }
}

export function isOfficeDocumentUrl(url: string): boolean {
  return isDocxUrl(url) || isPptxUrl(url) || isXlsxUrl(url);
}
