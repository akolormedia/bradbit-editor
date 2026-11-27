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
