import { ByokProviderStatus, OpenCodeModel } from "../types";

export interface SearchAiModelOption {
  value: string;
  label: string;
}

export interface SearchAiTarget {
  providerId: string;
  model: string;
}

const COMPLETION_KINDS = new Set([
  "deepseek",
  "openrouter",
  "openai",
  "anthropic",
  "custom",
]);

/** OpenCode keys power the agent runtime, not the direct BYOK completion API. */
export function supportsSearchAi(kind: string): boolean {
  return COMPLETION_KINDS.has(kind);
}

/** Model keys use the same "provider/model" shape as recent chat models. */
export function searchAiModelKey(providerId: string, modelId: string): string {
  return `${providerId}/${modelId}`;
}

export function parseSearchAiModel(value: string): SearchAiTarget | null {
  const trimmed = value.trim();
  const slash = trimmed.indexOf("/");
  if (slash <= 0 || slash >= trimmed.length - 1) return null;
  const model = trimmed.slice(slash + 1).split("#")[0].trim();
  if (!model) return null;
  return {
    providerId: trimmed.slice(0, slash).trim(),
    model,
  };
}

/**
 * Returns the models a keyed BYOK provider can actually call. Chat models
 * enrich the list with every model OpenCode knows for that provider; the
 * provider's configured model covers custom endpoints.
 */
export function buildSearchAiModelOptions(
  providers: readonly ByokProviderStatus[],
  models: readonly OpenCodeModel[],
  recentModels: readonly string[] = [],
): SearchAiModelOption[] {
  const connected = new Map(
    providers
      .filter((provider) => provider.hasKey && supportsSearchAi(provider.kind))
      .map((provider) => [provider.id, provider]),
  );
  const options = new Map<string, string>();

  for (const model of models) {
    const provider = connected.get(model.providerId);
    if (!provider) continue;
    const key = searchAiModelKey(provider.id, model.id);
    if (!options.has(key)) {
      options.set(key, `${provider.name} · ${model.name}`);
    }
  }

  for (const recent of recentModels) {
    const target = parseSearchAiModel(recent);
    if (!target) continue;
    const provider = connected.get(target.providerId);
    if (!provider) continue;
    const key = searchAiModelKey(provider.id, target.model);
    if (!options.has(key)) {
      options.set(key, `${provider.name} · ${target.model}`);
    }
  }

  for (const provider of connected.values()) {
    const model = provider.model?.trim();
    if (!model) continue;
    const key = searchAiModelKey(provider.id, model);
    if (!options.has(key)) {
      options.set(key, `${provider.name} · ${model}`);
    }
  }

  return [...options].map(([value, label]) => ({ value, label }));
}

/** Resolves the configured search model only when its provider still has a key. */
export function configuredSearchAiTarget(
  value: string,
  providers: readonly ByokProviderStatus[],
): SearchAiTarget | null {
  const target = parseSearchAiModel(value);
  if (!target) return null;
  const provider = providers.find(
    (item) =>
      item.id === target.providerId &&
      item.hasKey &&
      supportsSearchAi(item.kind),
  );
  if (!provider) return null;
  return { providerId: provider.id, model: target.model };
}

/** Maps the backend's empty/truncated completion errors to UI copy. */
export function searchAiErrorKind(
  message: string,
): "empty" | "truncated" | null {
  if (/empty answer/i.test(message)) return "empty";
  if (/ran out of tokens/i.test(message)) return "truncated";
  return null;
}
