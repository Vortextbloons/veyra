import { useEffect, useState } from "react";
import type { CharacterRecord } from "./character-types";
import { getAvatarGradient } from "./character-gradients";

interface CharacterAvatarProps {
  character: CharacterRecord;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<CharacterAvatarProps["size"]>, string> = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-[12.5px]",
  lg: "size-12 text-[14px]",
  xl: "size-16 text-[18px]",
};

const SHAPE_CLASS = "rounded-2xl";

/**
 * Render a character's avatar. If the character has an uploaded image
 * (`avatarPath`), load and display it. Otherwise fall back to the
 * initial-based gradient avatar.
 */
export function CharacterAvatar({ character, size = "md", className }: CharacterAvatarProps) {
  const [url, setUrl] = useState<string | null>(null);
  const path = character.avatarPath;

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    import("./character-avatar").then(({ ensureCharacterAvatarUrl }) =>
      ensureCharacterAvatarUrl(path).then((u) => {
        if (!cancelled) setUrl(u);
      }).catch(() => {
        if (!cancelled) setUrl(null);
      }),
    );
    return () => {
      cancelled = true;
    };
  }, [path]);

  const initials = (character.name || "?").trim().slice(0, 2).toUpperCase();
  const sizeClass = SIZE_CLASS[size];
  const shapeClass = size === "sm" || size === "md" ? "rounded-full" : SHAPE_CLASS;
  const wrapperClass = `${shapeClass} ${sizeClass} ${className ?? ""}`.trim();

  if (character.avatarPath && url) {
    return (
      <div
        className={`${wrapperClass} relative overflow-hidden bg-[var(--color-bg)]`}
        style={{
          backgroundImage: `url(${url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
        aria-label={character.name}
        role="img"
      >
        <img src={url} alt="" className="hidden" />
      </div>
    );
  }

  const gradient = getAvatarGradient(character.avatarColor);
  return (
    <div
      className={`${wrapperClass} grid place-items-center ${gradient} font-semibold text-white`}
      aria-label={character.name}
      role="img"
    >
      {initials}
    </div>
  );
}
