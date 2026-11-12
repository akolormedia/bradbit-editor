import { ByokProvider, ByokProviderKind } from "../types";

export interface ByokPreset {
  kind: ByokProviderKind;
  name: string;
  envVar: string;
}

export interface ByokDraft {
  kind: ByokProviderKind;
  id: string;
  name: string;
  baseUrl: string;
  model: string;
}

export type ByokValidationError =
  | "id"
  | "name"
  | "baseUrl"
  | "model"
  | "duplicate";

export const BYOK_PRESETS: ByokPreset[] = [
  { kind: "deepseek", name: "DeepSeek", envVar: "DEEPSEEK_API_KEY" },
  { kind: "openrouter", name: "OpenRouter", envVar: "OPENROUTER_API_KEY" },
  { kind: "openai", name: "OpenAI", envVar: "OPENAI_API_KEY" },
  { kind: "anthropic", name: "Anthropic", envVar: "ANTHROPIC_API_KEY" },
];

export function byokPreset(kind: ByokProviderKind): ByokPreset | null {
  return BYOK_PRESETS.find((preset) => preset.kind === kind) ?? null;
}

export function byokDraft(kind: ByokProviderKind = "deepseek"): ByokDraft {
  const preset = byokPreset(kind);
  return {
    kind,
    id: preset?.kind ?? "",
    name: preset?.name ?? "",
    baseUrl: "",
    model: "",
  };
}

export function customEnvVar(id: string): string {
  const slug = id
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "_")
    .replace(/^_+|_+$/g, "");
  return `BRADBIT_${slug || "PROVIDER"}_API_KEY`;
}

export function validateByokDraft(
  draft: ByokDraft,
  existingIds: string[] = [],
): ByokValidationError | null {
  const preset = byokPreset(draft.kind);
  const id = preset?.kind ?? draft.id.trim();
  const name = preset?.name ?? draft.name.trim();

  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return "id";
  if (!name || name.length > 80) return "name";
  if (existingIds.includes(id)) return "duplicate";
  if (!preset) {
    const baseUrl = draft.baseUrl.trim().toLowerCase();
    if (
      draft.baseUrl.trim().length > 2048 ||
      /\s/.test(draft.baseUrl) ||
      !(baseUrl.startsWith("http://") || baseUrl.startsWith("https://"))
    ) {
      return "baseUrl";
    }
    if (!draft.model.trim() || draft.model.trim().length > 120) {
      return "model";
    }
  }
  return null;
}

export function byokProviderFromDraft(draft: ByokDraft): ByokProvider {
  const preset = byokPreset(draft.kind);
  if (preset) {
    return {
      id: preset.kind,
      name: preset.name,
      kind: preset.kind,
      envVar: preset.envVar,
    };
  }
  const id = draft.id.trim();
  return {
    id,
    name: draft.name.trim(),
    kind: "custom",
    baseUrl: draft.baseUrl.trim(),
    model: draft.model.trim(),
    envVar: customEnvVar(id),
  };
}
