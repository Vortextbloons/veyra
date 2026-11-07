import { defineComponent } from "@openuidev/react-lang";
import { useState } from "react";
import { z } from "zod/v4";
import { iconByName } from "./icons";
import { color, cx, fg, radius, radiusSchema, size, webUrl } from "./style";

const ICON_SIZE: Record<string, string> = {
  sm: "size-3.5",
  md: "size-4",
  lg: "size-5",
  xl: "size-7",
};

export const Icon = defineComponent({
  name: "Icon",
  props: z.object({
    name: z.string(),
    size: z.enum(["sm", "md", "lg", "xl"]).optional(),
    color: color.optional(),
  }),
  description: 'Lucide icon by name, e.g. "map-pin".',
  component: ({ props }) => {
    const Glyph = iconByName(props.name);
    return (
      <span className="inline-flex shrink-0 items-center" style={{ color: fg(props.color) ?? "var(--color-text-dim)" }}>
        <Glyph className={ICON_SIZE[props.size ?? "md"]} aria-hidden />
      </span>
    );
  },
});

export const Image = defineComponent({
  name: "Image",
  props: z.object({
    src: z.string(),
    alt: z.string(),
    aspectRatio: z.number().optional(),
    radius: radiusSchema.optional(),
    fit: z.enum(["cover", "contain"]).optional(),
  }),
  description: "Photo from an http(s) URL. If it fails to load, a neutral placeholder stays in place.",
  component: function ImageView({ props }) {
    const [failed, setFailed] = useState(false);
    const url = webUrl(props.src);
    const ratio = props.aspectRatio && props.aspectRatio > 0 ? props.aspectRatio : 1.5;
    if (!url || failed) {
      return (
        <div
          className="flex w-full items-center justify-center border border-white/[0.08] bg-white/[0.03] text-[10px] text-[var(--color-text-dim)]"
          style={{ aspectRatio: String(ratio), borderRadius: radius(props.radius) ?? "10px" }}
        >
          {props.alt || "Image unavailable"}
        </div>
      );
    }
    return (
      <img
        src={url}
        alt={props.alt}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cx("block w-full", props.fit === "contain" ? "object-contain" : "object-cover")}
        style={{
          aspectRatio: String(ratio),
          borderRadius: radius(props.radius) ?? "10px",
          width: size("100%"),
          border: "1px solid color-mix(in srgb, var(--color-text) 8%, transparent)",
        }}
      />
    );
  },
});
