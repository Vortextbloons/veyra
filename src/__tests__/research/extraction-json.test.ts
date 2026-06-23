import { describe, expect, it } from "vitest";
import {
  maxEvidenceItemsPerSource,
  parseResearchEvidenceArray,
  salvageEvidenceObjects,
  stripMarkdownJsonFence,
  stripThinkingBlocks,
} from "../../modules/research/extraction-json";

describe("parseResearchEvidenceArray", () => {
  it("parses valid evidence wrapper JSON", () => {
    const result = parseResearchEvidenceArray(
      '{"evidence":[{"sourceIndex":1,"type":"fact","content":"The study found a 37% increase.","confidence":0.9,"significance":"high"}]}',
    );
    expect(result).toHaveLength(1);
    expect(result?.[0]?.content).toContain("37%");
  });

  it("parses fenced JSON without a closing fence", () => {
    const result = parseResearchEvidenceArray(`\`\`\`json
{
  "evidence": [
    {
      "type": "claim",
      "content": "Gemma 4 emphasizes long context and native function calling.",
      "confidence": 0.8,
      "significance": "high"
    }
  ]
`);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.type).toBe("claim");
  });

  it("salvages a truncated object with usable content", () => {
    const truncated = `\`\`\`json
{
  "evidence": [
    {
      "type": "claim",
      "content": "Gemma 4's official materials emphasize long context, native function calling, native support for the system role, configurable thinking, and multimodal understanding that explicitly includes document and PDF parsing plus screen and UI understanding.",
      "confidence":`;
    const result = parseResearchEvidenceArray(truncated);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.content).toContain("Gemma 4");
    expect(result?.[0]?.confidence).toBe(0.5);
    expect(result?.[0]?.significance).toBe("medium");
  });

  it("returns an empty array for explicit empty evidence", () => {
    expect(parseResearchEvidenceArray('{"evidence":[]}')).toEqual([]);
  });

  it("strips thinking tags before parsing", () => {
    const result = parseResearchEvidenceArray(`<thinking>planning extraction</thinking>
{"evidence":[{"type":"fact","content":"Verified benchmark result from the paper.","confidence":0.9,"significance":"medium"}]}`);
    expect(result).toHaveLength(1);
    expect(result?.[0]?.content).toContain("benchmark");
  });
});

describe("salvageEvidenceObjects", () => {
  it("keeps complete objects and drops only the trailing fragment", () => {
    const salvaged = salvageEvidenceObjects(`{"evidence":[
      {"type":"fact","content":"First complete finding with enough text.","confidence":0.9,"significance":"high"},
      {"type":"claim","content":"Second complete finding with enough text.","confidence":0.7,"significance":"medium"},
      {"type":"claim","content":"Third truncated finding with enough text.","confidence":
    `);
    expect(salvaged).toHaveLength(3);
    expect(salvaged?.[2]?.confidence).toBe(0.5);
  });
});

describe("helpers", () => {
  it("strips opening markdown fences", () => {
    expect(stripMarkdownJsonFence("```json\n{\"evidence\":[]}")).toBe('{"evidence":[]}');
  });

  it("removes redacted thinking blocks", () => {
    expect(stripThinkingBlocks("<think>hidden</think>\n{\"evidence\":[]}"))
      .toBe('{"evidence":[]}');
  });

  it("caps per-source evidence counts for batch size", () => {
    expect(maxEvidenceItemsPerSource(1)).toBe(3);
    expect(maxEvidenceItemsPerSource(2)).toBe(3);
    expect(maxEvidenceItemsPerSource(5)).toBe(1);
  });
});
