import { library } from "./library";
import { promptOptions } from "./prompt";

/**
 * Builds the artifacts the app needs from the component library: the system
 * prompt that teaches the model the language, and the JSON schema the parser
 * validates programs against. `scripts/generate-interactive-prompt.mjs` bundles
 * this module with esbuild and writes `generated.ts`, so the React renderer and
 * the parser never have to be loaded to produce a prompt.
 */
export function buildInteractiveAnswerArtifacts() {
  return {
    prompt: library.prompt(promptOptions),
    schema: library.toJSONSchema(),
    root: library.root ?? "Col",
  };
}
