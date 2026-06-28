import { describe, expect, it } from "vitest";
import { isYouTubeUrl, isPdfUrl, isDocxUrl, isPptxUrl, isXlsxUrl, isEpubUrl, isArxivUrl, isWikipediaUrl, isOfficeDocumentUrl } from "../../lib/url-classifiers";

describe("url-classifiers", () => {
  describe("isYouTubeUrl", () => {
    it("matches youtube.com", () => {
      expect(isYouTubeUrl("https://youtube.com/watch?v=123")).toBe(true);
    });

    it("matches www.youtube.com", () => {
      expect(isYouTubeUrl("https://www.youtube.com/watch?v=123")).toBe(true);
    });

    it("matches m.youtube.com", () => {
      expect(isYouTubeUrl("https://m.youtube.com/watch?v=123")).toBe(true);
    });

    it("matches music.youtube.com", () => {
      expect(isYouTubeUrl("https://music.youtube.com/watch?v=123")).toBe(true);
    });

    it("matches youtu.be", () => {
      expect(isYouTubeUrl("https://youtu.be/123")).toBe(true);
    });

    it("rejects other domains", () => {
      expect(isYouTubeUrl("https://vimeo.com/123")).toBe(false);
    });

    it("handles malformed URLs", () => {
      expect(isYouTubeUrl("not a url")).toBe(false);
    });
  });

  describe("isPdfUrl", () => {
    it("matches .pdf extension", () => {
      expect(isPdfUrl("https://example.com/doc.pdf")).toBe(true);
    });

    it("matches .pdf in path", () => {
      expect(isPdfUrl("https://example.com/files/doc.pdf/page")).toBe(true);
    });

    it("rejects non-pdf", () => {
      expect(isPdfUrl("https://example.com/doc.html")).toBe(false);
    });
  });

  describe("isDocxUrl", () => {
    it("matches .docx", () => {
      expect(isDocxUrl("https://example.com/doc.docx")).toBe(true);
    });

    it("matches office document mime", () => {
      expect(isDocxUrl("https://example.com/?type=officedocument.wordprocessingml")).toBe(true);
    });
  });

  describe("isPptxUrl", () => {
    it("matches .pptx", () => {
      expect(isPptxUrl("https://example.com/slide.pptx")).toBe(true);
    });
  });

  describe("isXlsxUrl", () => {
    it("matches .xlsx", () => {
      expect(isXlsxUrl("https://example.com/data.xlsx")).toBe(true);
    });
  });

  describe("isEpubUrl", () => {
    it("matches .epub", () => {
      expect(isEpubUrl("https://example.com/book.epub")).toBe(true);
    });
  });

  describe("isArxivUrl", () => {
    it("matches arxiv.org", () => {
      expect(isArxivUrl("https://arxiv.org/abs/2301.00001")).toBe(true);
    });

    it("matches subdomain", () => {
      expect(isArxivUrl("https://export.arxiv.org/pdf/2301.00001")).toBe(true);
    });

    it("rejects non-arxiv", () => {
      expect(isArxivUrl("https://example.com/paper")).toBe(false);
    });
  });

  describe("isWikipediaUrl", () => {
    it("matches en.wikipedia.org", () => {
      expect(isWikipediaUrl("https://en.wikipedia.org/wiki/Artificial_intelligence")).toBe(true);
    });

    it("matches any subdomain", () => {
      expect(isWikipediaUrl("https://fr.wikipedia.org/wiki/Science")).toBe(true);
    });

    it("rejects non-wikipedia", () => {
      expect(isWikipediaUrl("https://example.com/wiki")).toBe(false);
    });
  });

  describe("isOfficeDocumentUrl", () => {
    it("matches any office format", () => {
      expect(isOfficeDocumentUrl("https://example.com/doc.docx")).toBe(true);
      expect(isOfficeDocumentUrl("https://example.com/slide.pptx")).toBe(true);
      expect(isOfficeDocumentUrl("https://example.com/data.xlsx")).toBe(true);
    });

    it("rejects non-office", () => {
      expect(isOfficeDocumentUrl("https://example.com/file.pdf")).toBe(false);
    });
  });
});
