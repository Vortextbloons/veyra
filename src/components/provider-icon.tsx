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
          src="/logos/lm-studio.png"
          alt=""
          className={className}
        />
      );
    case "ollama":
      return (
        <img
          src="/logos/ollama.png"
          alt=""
          className={className}
        />
      );
    default:
      return <Server className={className} />;
  }
}
