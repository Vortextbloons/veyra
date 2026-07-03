import { useState } from "react";
import { ImageOff } from "lucide-react";

interface EmailHtmlBodyProps {
  html: string;
  blockRemoteImages?: boolean;
}

export function EmailHtmlBody({
  html,
  blockRemoteImages = true,
}: EmailHtmlBodyProps) {
  const [showImages, setShowImages] = useState(false);

  // If blocking remote images and user hasn't opted in, replace data-remote-src with placeholder.
  const displayHtml =
    blockRemoteImages && !showImages
      ? html.replace(
          /data-remote-src="([^"]+)"/g,
          'src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2724%27 height=%2724%27%3E%3Crect width=%2724%27 height=%2724%27 fill=%27%23333%27/%3E%3Ctext x=%2712%27 y=%2716%27 text-anchor=%27middle%27 fill=%23%23999%27 font-size=%2710%27%3Eimg%3C/text%3E%3C/svg%3E" data-blocked-remote="true"',
        )
      : html.replace(/data-remote-src="([^"]+)"/g, 'src="$1"');

  const hasRemoteImages = html.includes("data-remote-src=");

  return (
    <div className="relative">
      {hasRemoteImages && blockRemoteImages && !showImages && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] text-[var(--color-text-dim)]">
          <ImageOff className="size-3.5 shrink-0" />
          <span>Remote images blocked</span>
          <button
            type="button"
            onClick={() => setShowImages(true)}
            className="ml-auto text-[var(--color-accent)] hover:underline"
          >
            Show images
          </button>
        </div>
      )}
      {hasRemoteImages && blockRemoteImages && showImages && (
        <div className="mb-2 flex items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] text-[var(--color-text-dim)]">
          <span>Remote images shown</span>
          <button
            type="button"
            onClick={() => setShowImages(false)}
            className="ml-auto text-[var(--color-accent)] hover:underline"
          >
            Hide images
          </button>
        </div>
      )}
      <div
        className="email-html-body prose-invert max-w-none text-[12.5px] leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-accent)] [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-[var(--color-border)] [&_blockquote]:pl-3 [&_blockquote]:text-[var(--color-text-dim)] [&_img]:max-w-full [&_img]:rounded [&_pre]:whitespace-pre-wrap [&_pre]:rounded-md [&_pre]:bg-[var(--color-surface)] [&_pre]:p-2 [&_table]:text-[12px]"
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
    </div>
  );
}
