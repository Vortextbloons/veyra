// Markdown parsing and section manipulation utilities

type MarkdownSection = {
  title: string;
  level: number; // 1-6 for h1-h6
  content: string; // content including the heading line
  startLine: number;
  endLine: number;
};

/**
 * Parse markdown into sections based on headings.
 * Returns an array of sections, each with title, level, content, and line range.
 */
function parseMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split("\n");
  const sections: MarkdownSection[] = [];
  let currentSection: MarkdownSection | null = null;
  let contentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join("\n");
        currentSection.endLine = i - 1;
        sections.push(currentSection);
      }

      // Start new section
      const level = headingMatch[1].length;
      const title = headingMatch[2].trim();
      currentSection = {
        title,
        level,
        content: "",
        startLine: i,
        endLine: i,
      };
      contentLines = [line];
    } else {
      contentLines.push(line);
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = contentLines.join("\n");
    currentSection.endLine = lines.length - 1;
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Replace a section by its heading title.
 * If the section is not found, returns the original markdown unchanged.
 */
export function replaceMarkdownSection(
  markdown: string,
  sectionTitle: string,
  newContent: string
): string {
  const sections = parseMarkdownSections(markdown);
  const targetIdx = sections.findIndex(
    (s) => s.title.toLowerCase() === sectionTitle.toLowerCase()
  );

  if (targetIdx === -1) {
    return markdown;
  }

  const target = sections[targetIdx];
  const lines = markdown.split("\n");

  // Replace the section content
  const before = lines.slice(0, target.startLine);
  const after = lines.slice(target.endLine + 1);

  return [...before, newContent, ...after].join("\n");
}

/**
 * Insert content after a section by its heading title.
 * If the section is not found, appends to the end.
 */
export function insertAfterSection(
  markdown: string,
  sectionTitle: string,
  newContent: string
): string {
  const sections = parseMarkdownSections(markdown);
  const targetIdx = sections.findIndex(
    (s) => s.title.toLowerCase() === sectionTitle.toLowerCase()
  );

  if (targetIdx === -1) {
    // Section not found, append to end
    return markdown.trimEnd() + "\n\n" + newContent;
  }

  const target = sections[targetIdx];
  const lines = markdown.split("\n");

  const before = lines.slice(0, target.endLine + 1);
  const after = lines.slice(target.endLine + 1);

  return [...before, "", newContent, ...after].join("\n");
}

/**
 * Count words in markdown content (ignores markdown syntax).
 */
export function countWords(markdown: string): number {
  // Strip markdown syntax for word count
  const plain = markdown
    .replace(/#{1,6}\s+/g, "") // headings
    .replace(/\*\*|__/g, "") // bold
    .replace(/\*|_/g, "") // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/^\s*[-*+]\s+/gm, "") // lists
    .replace(/^\s*\d+\.\s+/gm, "") // numbered lists
    .replace(/^\s*>\s+/gm, "") // blockquotes
    .trim();

  if (!plain) return 0;
  return plain.split(/\s+/).filter(Boolean).length;
}

/**
 * Count characters in markdown content.
 */
export function countCharacters(markdown: string): number {
  return markdown.length;
}
