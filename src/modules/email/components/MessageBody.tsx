import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { EmailHtmlBody } from "./EmailHtmlBody";
import type { EmailMessage } from "../email-types";

export function MessageBody({ message }: { message: EmailMessage }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const parsed = message.parsedParts ?? {
    latestReply: "",
    quotedHtml: "",
    signature: "",
    forwarded: "",
    parseStatus: "fallback" as const,
  };
  const hasHtmlBody = Boolean(message.bodyHtml);
  const hasParsedContent =
    parsed && parsed.parseStatus === "parsed" && parsed.latestReply;

  if (hasParsedContent) {
    return (
      <div className="mt-3">
        {/* Latest reply content */}
        {hasHtmlBody ? (
          <EmailHtmlBody html={parsed.latestReply} />
        ) : (
          <div className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text)]">
            {parsed.latestReply}
          </div>
        )}

        {/* Signature */}
        {parsed.signature && (
          <div className="mt-2 whitespace-pre-wrap border-t border-[var(--color-border)]/30 pt-2 text-[11.5px] text-[var(--color-text-dim)]">
            {parsed.signature}
          </div>
        )}

        {/* Forwarded section */}
        {parsed.forwarded && (
          <div className="mt-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
            <div className="mb-1 text-[11px] font-medium text-[var(--color-text-dim)]">
              Forwarded message
            </div>
            <div className="whitespace-pre-wrap text-[12px] text-[var(--color-text-dim)]">
              {parsed.forwarded}
            </div>
          </div>
        )}

        {/* Collapsed quoted text */}
        {parsed.quotedHtml && (
          <div className="mt-3">
            <button
              type="button"
              onClick={() => setShowQuoted(!showQuoted)}
              className="flex items-center gap-1 text-[11px] text-[var(--color-text-dim)] hover:text-[var(--color-text)]"
            >
              {showQuoted ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              {showQuoted ? "Hide quoted text" : "Show quoted text"}
            </button>
            {showQuoted && (
              <div className="mt-2 border-l-2 border-[var(--color-border)] pl-3 text-[12px] text-[var(--color-text-dim)]">
                {hasHtmlBody ? (
                  <EmailHtmlBody html={parsed.quotedHtml} />
                ) : (
                  <div className="whitespace-pre-wrap">
                    {parsed.quotedHtml}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Fallback: use sanitized HTML if available, otherwise plain text.
  if (message.sanitizedHtml) {
    return (
      <div className="mt-3">
        <EmailHtmlBody html={message.sanitizedHtml} />
      </div>
    );
  }

  return (
    <div className="mt-3 whitespace-pre-wrap text-[12.5px] leading-relaxed text-[var(--color-text)]">
      {message.body}
    </div>
  );
}
