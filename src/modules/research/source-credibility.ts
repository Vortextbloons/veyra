/**
 * Pre-baked domain credibility database.
 *
 * Scores: 1 = untrusted, 2 = low, 3 = medium, 4 = high, 5 = authoritative.
 *
 * The map is checked by substring match on the domain. Entries are ordered from
 * most specific to least specific so that a more precise match wins.
 */

interface CredibilityEntry {
  /** Substring patterns matched against the lowercase URL. */
  patterns: string[];
  score: number;
  /** Human-readable label for the AI prompt. */
  label: string;
}

const CREDIBILITY_DB: CredibilityEntry[] = [
  // ── Tier 5: Authoritative ──────────────────────────────────────────────
  { patterns: [".edu", ".gov", "arxiv.org", "pubmed.ncbi.nlm.nih.gov", "nih.gov", "who.int", "cdc.gov", "nasa.gov"], score: 5, label: "government/academic" },
  { patterns: ["nature.com", "science.org", "thelancet.com", "cell.com", "pnas.org", "jamanetwork.com", "bmj.com"], score: 5, label: "peer-reviewed journal" },
  { patterns: ["ieee.org", "acm.org", "springer.com", "wiley.com", "elsevier.com", "tandfonline.com"], score: 5, label: "academic publisher" },
  { patterns: ["sec.gov", "federalregister.gov", "congress.gov", "supremecourt.gov", "whitehouse.gov"], score: 5, label: "US government" },
  { patterns: ["ecb.europa.eu", "worldbank.org", "imf.org", "oecd.org", "un.org"], score: 5, label: "international organization" },

  // ── Tier 4: High ───────────────────────────────────────────────────────
  { patterns: ["reuters.com", "apnews.com"], score: 4, label: "wire news agency" },
  { patterns: ["bbc.com", "bbc.co.uk", "economist.com", "foreignaffairs.com", "foreignpolicy.com"], score: 4, label: "major news outlet" },
  { patterns: ["nytimes.com", "washingtonpost.com", "wsj.com", "ft.com", "theatlantic.com", "newyorker.com"], score: 4, label: "major newspaper" },
  { patterns: ["wikipedia.org"], score: 4, label: "Wikipedia (curated secondary source)" },
  { patterns: ["techcrunch.com", "arstechnica.com", "wired.com", "theverge.com", "anandtech.com"], score: 4, label: "tech journalism" },
  { patterns: ["scholar.google.com", "semanticscholar.org", "researchgate.net", "jstor.org"], score: 4, label: "academic database" },
  { patterns: ["mayo.org", "clevelandclinic.org", "webmd.com", "mayoclinic.org", "nih.gov"], score: 4, label: "medical institution" },

  // ── Tier 3: Medium ─────────────────────────────────────────────────────
  { patterns: ["github.com", "gitlab.com", "bitbucket.org"], score: 3, label: "code repository" },
  { patterns: ["stackoverflow.com", "stackexchange.com"], score: 3, label: "developer Q&A" },
  { patterns: ["medium.com", "substack.com", "ghost.io"], score: 3, label: "blogging platform" },
  { patterns: ["dev.to", "hashnode.com", "dzone.com"], score: 3, label: "developer blog" },
  { patterns: ["docs.python.org", "developer.mozilla.org", "docs.rs", "pkg.go.dev", "crates.io"], score: 3, label: "official docs/registry" },
  { patterns: ["npmjs.com", "pypi.org", "crates.io", "rubygems.org", "nuget.org"], score: 3, label: "package registry" },
  { patterns: ["hacks.mozilla.org", "blog.google", "engineering.fb.com", "netflix.github.io"], score: 3, label: "tech company blog" },

  // ── Tier 2: Low ────────────────────────────────────────────────────────
  { patterns: ["reddit.com", "lobste.rs", "news.ycombinator.com", "slashdot.org"], score: 2, label: "community forum" },
  { patterns: ["quora.com", "stackoverflow.blog"], score: 2, label: "community Q&A" },
  { patterns: ["blogspot.com", "wordpress.com", "tumblr.com", "medium.com/@", "substack.com/"], score: 2, label: "personal blog" },
  { patterns: ["producthunt.com", "hackernews.com"], score: 2, label: "community aggregation" },

  // ── Tier 1: Untrusted ──────────────────────────────────────────────────
  { patterns: ["answers.yahoo.com", "wikihow.com", "ehow.com", "livestrong.com"], score: 1, label: "content farm" },
  { patterns: ["fakefakefake.com", "theonion.com", "thebeaverton.com", "babylonbee.com"], score: 1, label: "satire" },
];

/**
 * Pre-computed map for O(1) domain lookups. Built once at module load.
 */
const DOMAIN_SCORE_MAP: Map<string, { score: number; label: string }> = new Map();

function buildDomainMap(): void {
  for (const entry of CREDIBILITY_DB) {
    for (const pattern of entry.patterns) {
      if (!DOMAIN_SCORE_MAP.has(pattern)) {
        DOMAIN_SCORE_MAP.set(pattern, { score: entry.score, label: entry.label });
      }
    }
  }
}

buildDomainMap();

/**
 * Returns a credibility score (1-5) and label for a URL.
 * Uses pre-baked database first; falls back to heuristics for unknown domains.
 */
export function getCredibilityScore(url: string): { score: number; label: string } {
  const lower = url.toLowerCase();

  // Strip protocol and www.
  const clean = lower.replace(/^https?:\/\//, "").replace(/^www\./, "");

  // Try substring match against the database (most specific first)
  for (const [pattern, entry] of DOMAIN_SCORE_MAP) {
    if (clean.includes(pattern)) {
      return { score: entry.score, label: entry.label };
    }
  }

  // Fallback heuristics for unknown domains
  if (clean.endsWith(".edu") || clean.endsWith(".gov") || clean.endsWith(".mil")) {
    return { score: 5, label: "government/academic (TLD)" };
  }
  if (clean.endsWith(".org")) {
    return { score: 3, label: "non-profit (TLD)" };
  }
  if (clean.endsWith(".io") || clean.endsWith(".dev")) {
    return { score: 3, label: "tech domain (TLD)" };
  }

  // Check for common URL path patterns
  if (lower.includes("/blog/")) return { score: 2, label: "blog" };
  if (lower.includes("/docs/")) return { score: 3, label: "documentation" };
  if (lower.includes("/wiki/")) return { score: 3, label: "wiki" };

  // Default: unknown = medium
  return { score: 3, label: "unknown source" };
}

/**
 * Returns a normalized authority score 0.0–1.0 for the evidence weighting system.
 */
export function getNormalizedAuthority(url: string): number {
  const { score } = getCredibilityScore(url);
  return score / 5;
}

/**
 * Builds a summary string for the AI prompt showing source credibility.
 */
export function formatCredibilitySummary(sources: Array<{ title: string; url: string }>): string {
  return sources
    .map((s, i) => {
      const { score, label } = getCredibilityScore(s.url);
      const bar = "█".repeat(score) + "░".repeat(5 - score);
      return `[${i + 1}] ${s.title} — ${bar} ${score}/5 (${label})`;
    })
    .join("\n");
}
