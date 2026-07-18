export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const TRUNCATION_MARKER = "\n\n[…truncated to fit budget…]\n";

function truncateTopLevelXmlBlock(block: string, maxChars: number): string {
  const opening = block.match(/^<([a-z0-9_]+)>\n?/i);
  if (!opening) return "";
  const closing = `</${opening[1]}>`;
  if (!block.endsWith(closing)) return "";
  const fixedLength = opening[0].length + TRUNCATION_MARKER.length + closing.length;
  if (maxChars <= fixedLength) return "";
  const bodyEnd = block.length - closing.length;
  const bodyBudget = maxChars - fixedLength;
  return `${opening[0]}${block.slice(opening[0].length, opening[0].length + Math.min(bodyBudget, bodyEnd - opening[0].length)).trimEnd()}${TRUNCATION_MARKER}${closing}`;
}

/**
 * Fit complete top-level XML prompt blocks within a character budget. If the
 * next block is too large, truncate only its body and retain its closing tag.
 */
export function fitXmlPromptBlocks(parts: string[], maxChars: number): string {
  if (maxChars <= 0) return parts.join("\n\n");
  const fitted: string[] = [];
  let used = 0;
  for (const part of parts) {
    const separatorLength = fitted.length > 0 ? 2 : 0;
    const available = maxChars - used - separatorLength;
    if (available <= 0) break;
    if (part.length <= available) {
      fitted.push(part);
      used += separatorLength + part.length;
      continue;
    }
    const truncated = truncateTopLevelXmlBlock(part, available);
    if (truncated) fitted.push(truncated);
    break;
  }
  return fitted.join("\n\n");
}
