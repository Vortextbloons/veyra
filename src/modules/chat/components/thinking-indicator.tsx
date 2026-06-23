import { memo } from "react";

export const ThinkingIndicator = memo(function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1 py-1.5 px-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="block size-1.5 rounded-full bg-indigo-400"
          style={{
            animation: "thinkingBounce 1.2s ease-in-out infinite",
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
});
