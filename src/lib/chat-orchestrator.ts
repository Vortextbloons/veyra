import type { ChatMessage } from "@/lib/chat-types";
import { buildChatContext } from "@/lib/context";
import { getProviderAdapter } from "@/lib/providers";
import type { ProviderChatOptions } from "@/lib/providers/types";

export type SendChatRequest = Omit<ProviderChatOptions, "messages"> & {
  providerId: string;
  messages: ChatMessage[];
};

export async function sendChatRequest({
  providerId,
  messages,
  ...options
}: SendChatRequest): Promise<void> {
  const provider = getProviderAdapter(providerId);
  if (!provider) {
    options.onError(`Provider not found: ${providerId}`);
    return;
  }

  await provider.sendChat({
    ...options,
    messages: buildChatContext(messages),
  });
}
