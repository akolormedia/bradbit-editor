import { ByokProviderStatus, OpenCodeModel } from "../types";

const PROVIDER_ALIASES: Record<string, readonly string[]> = {
  opencode: ["opencode-go"],
};

/**
 * Only expose providers whose API key is available in the app. OpenCode may
 * list every provider it knows about, even when no key exists.
 */
export function filterChatModelsByKeys(
  models: readonly OpenCodeModel[],
  providers: readonly ByokProviderStatus[],
): OpenCodeModel[] {
  const allowed = new Set<string>();
  for (const provider of providers) {
    if (!provider.hasKey) continue;
    allowed.add(provider.id);
    for (const alias of PROVIDER_ALIASES[provider.id] ?? []) {
      allowed.add(alias);
    }
  }
  if (allowed.size === 0) return [];
  return models.filter((model) => allowed.has(model.providerId));
}

export interface ChatModelSelection {
  providerId: string;
  modelId: string;
  variant: string;
}

/**
 * Parses the `provider/model#variant` ref used by the chat composer. The
 * variant carries the reasoning effort selected for the model.
 */
export function parseChatModelSelection(
  raw: string | null | undefined,
): ChatModelSelection | null {
  if (!raw) return null;
  const hash = raw.indexOf("#");
  const base = hash >= 0 ? raw.slice(0, hash) : raw;
  const variant = hash >= 0 ? raw.slice(hash + 1) : "";
  const slash = base.indexOf("/");
  if (slash <= 0 || slash === base.length - 1) return null;
  return {
    providerId: base.slice(0, slash),
    modelId: base.slice(slash + 1),
    variant,
  };
}
