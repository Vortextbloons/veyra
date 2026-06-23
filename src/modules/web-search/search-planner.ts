export type SearchLane = "general" | "recent" | "academic" | "primary" | "opposing";

export type PlannedSearchQuery = {
  query: string;
  lane: SearchLane;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "to", "vs", "what", "when", "where", "which", "who", "why", "with",
]);

function compactQuery(query: string): string {
  return query.replace(/\s+/g, " ").trim();
}

function keyTerms(query: string): string[] {
  return compactQuery(query)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
    .slice(0, 8);
}

function addUnique(out: PlannedSearchQuery[], seen: Set<string>, query: string, lane: SearchLane): void {
  const cleaned = compactQuery(query);
  const key = cleaned.toLowerCase();
  if (!cleaned || seen.has(key)) return;
  seen.add(key);
  out.push({ query: cleaned, lane });
}

export function planSearchQueries(query: string, maxQueries: number): PlannedSearchQuery[] {
  const terms = keyTerms(query);
  const core = terms.length >= 2 ? terms.join(" ") : compactQuery(query);
  const out: PlannedSearchQuery[] = [];
  const seen = new Set<string>();

  addUnique(out, seen, query, "general");
  if (maxQueries <= out.length) return out;

  addUnique(out, seen, `${core} overview analysis`, "general");
  if (maxQueries <= out.length) return out.slice(0, maxQueries);

  addUnique(out, seen, `${core} latest ${new Date().getFullYear()}`, "recent");
  if (maxQueries <= out.length) return out.slice(0, maxQueries);

  addUnique(out, seen, `${core} research study evidence`, "academic");
  if (maxQueries <= out.length) return out.slice(0, maxQueries);

  addUnique(out, seen, `${core} government official data report`, "primary");
  if (maxQueries <= out.length) return out.slice(0, maxQueries);

  addUnique(out, seen, `${core} criticism limitations controversy`, "opposing");
  return out.slice(0, maxQueries);
}
