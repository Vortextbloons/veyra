import { Server } from "lucide-react";

type ProviderIconProps = {
  /** Provider identifier — maps to a specific brand logo */
  providerId: string;
  className?: string;
};

/**
 * Renders the official brand logo for a known provider,
 * or falls back to a generic icon for unknown providers.
 */
export function ProviderIcon({ providerId, className }: ProviderIconProps) {
  switch (providerId) {
    case "lm-studio":
      return (
        <img
          src="/logos/providers/lm-studio.png"
          alt=""
          className={className}
        />
      );
    case "ollama":
      return (
        <img
          src="/logos/providers/ollama.png"
          alt=""
          className={className}
        />
      );
    case "openai":
      return (
        <img
          src="/logos/providers/openai.svg"
          alt=""
          className={className}
        />
      );
    case "openrouter":
      return (
        <img
          src="/logos/providers/openrouter.png"
          alt=""
          className={className}
        />
      );
    case "nvidia-nim":
      return (
        <img
          src="/logos/providers/nvidia.svg"
          alt=""
          className={className}
        />
      );
    case "groq":
      return (
        <img
          src="/logos/providers/groq.ico"
          alt=""
          className={className}
        />
      );
    case "opencode-zen":
      return (
        <img
          src="/logos/providers/opencode-zen.ico"
          alt=""
          className={className}
        />
      );
    default:
      return <Server className={className} />;
  }
}
