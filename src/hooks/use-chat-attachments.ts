import type { MessageAttachment } from "@/lib/message-attachments";

export interface AttachmentFilterResult {
  effectiveAttachments: MessageAttachment[];
  blocked: boolean;
}

export function filterAttachments(
  attachments: MessageAttachment[] | undefined,
  supportsImages: boolean,
  trimmed: string,
): AttachmentFilterResult {
  const imageAttachments = attachments?.filter((a) => a.fileType === "image") ?? [];
  const fileAttachments = attachments?.filter((a) => a.fileType !== "image") ?? [];
  const allAttachments = attachments ?? [];

  if (imageAttachments.length > 0 && !supportsImages) {
    if (!trimmed && fileAttachments.length === 0) {
      return { effectiveAttachments: [], blocked: true };
    }
    return {
      effectiveAttachments: fileAttachments.length > 0 || trimmed ? fileAttachments : [],
      blocked: false,
    };
  }

  return { effectiveAttachments: allAttachments, blocked: false };
}
