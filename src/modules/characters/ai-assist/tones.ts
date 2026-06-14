// ── Shared tone presets for the AI assist flow ──────────────────────────────

import type { CharacterAssistTone } from "./ai-assist-types";

export interface TonePreset {
  id: CharacterAssistTone;
  label: string;
  description: string;
}

export const CHARACTER_TONE_PRESETS: TonePreset[] = [
  { id: "neutral", label: "Neutral", description: "Balanced and grounded." },
  { id: "evocative", label: "Evocative", description: "Lyrical, sensory-rich, atmospheric." },
  { id: "comedic", label: "Comedic", description: "Witty, playful, lighthearted." },
  { id: "grimdark", label: "Grimdark", description: "Brooding, morally complex, intense." },
  { id: "romantic", label: "Romantic", description: "Tender, intimate, emotionally charged." },
  { id: "mysterious", label: "Mysterious", description: "Enigmatic, restrained, suggestive." },
  { id: "scholarly", label: "Scholarly", description: "Precise, academic, well-structured." },
  { id: "casual", label: "Casual", description: "Relaxed, conversational, approachable." },
  { id: "custom", label: "Custom", description: "Use a free-form instruction." },
];
