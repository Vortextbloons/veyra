import { useState } from "react";
import { Server } from "lucide-react";
import type { ReactNode } from "react";

type ModelIconProps = {
  /** Model identifier — maps to a specific brand logo */
  modelId: string;
  className?: string;
  /** Optional fallback rendered when no family logo matches (or asset 404s).
   *  Defaults to a Lucide <Server /> icon. */
  fallback?: ReactNode;
};

function matchModelFamily(modelId: string): string | null {
  // Cloud providers commonly namespace model IDs (for example,
  // "deepseek-ai/deepseek-v4-flash"). Match the model segment so those
  // entries receive the same family icon as their local equivalents.
  const id = modelId.toLowerCase().split("/").at(-1) ?? modelId.toLowerCase();
  if (/^qwen|^qwq/i.test(id)) return "qwen";
  if (/^deepseek/i.test(id)) return "deepseek";
  if (/^llama|^codellama/i.test(id)) return "meta";
  if (/^mistral|^mixtral|^pixtral|^codestral/i.test(id)) return "mistral";
  if (/^gemma/i.test(id)) return "google";
  if (/^claude/i.test(id)) return "anthropic";
  if (/^phi/i.test(id)) return "microsoft";
  if (/^command/i.test(id)) return "cohere";
  if (/^yi/i.test(id)) return "yi";
  if (/^stable|^sdxl|^sd-/i.test(id)) return "stability";
  if (/^nous/i.test(id)) return "nous";
  if (/^nvidia|^nemotron/i.test(id)) return "nvidia";
  if (/^granite/i.test(id)) return "ibm";
  if (/^bge|^infinity/i.test(id)) return "baai";
  if (/^tulu|^olmo/i.test(id)) return "allenai";
  if (/^openchat/i.test(id)) return "openchat";
  if (/^neural.?chat/i.test(id)) return "neuralchat";
  if (/^zephyr/i.test(id)) return "huggingface";
  if (/^starling/i.test(id)) return "starling";
  if (/^vicuna/i.test(id)) return "lmsys";
  if (/^wizard/i.test(id)) return "wizard";
  if (/^smollm|^smol/i.test(id)) return "huggingface";
  if (/^internlm/i.test(id)) return "shanghai";
  if (/^chatglm/i.test(id)) return "zhipu";
  if (/^baichuan/i.test(id)) return "baichuan";
  if (/^dbrx/i.test(id)) return "databricks";
  if (/^minimax/i.test(id)) return "minimax";
  if (/^gpt-|^o[13]/i.test(id)) return "chatgpt";
  return null;
}

export function ModelIcon({ modelId, className, fallback }: ModelIconProps) {
  const family = matchModelFamily(modelId);
  const [imgFailed, setImgFailed] = useState(false);
  const [triedPng, setTriedPng] = useState(false);

  if (family && !imgFailed) {
    const src = triedPng ? `/logos/${family}.svg` : `/logos/${family}.png`;
    return (
      <img
        src={src}
        alt=""
        className={family === "deepseek"
          ? `${className ?? ""} object-cover object-[5%_center]`
          : className}
        onError={() => {
          if (!triedPng) {
            setTriedPng(true);
          } else {
            setImgFailed(true);
          }
        }}
      />
    );
  }
  return fallback ?? <Server className={className} />;
}
