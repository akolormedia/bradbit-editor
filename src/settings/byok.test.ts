import { describe, expect, it } from "vitest";
import {
  byokDraft,
  byokProviderFromDraft,
  byokPreset,
  customEnvVar,
  validateByokDraft,
} from "./byok";

describe("BYOK provider helpers (T-3.1.9)", () => {
  it("maps presets to their stable provider ids and environment variables", () => {
    expect(byokPreset("deepseek")).toEqual({
      kind: "deepseek",
      name: "DeepSeek",
      envVar: "DEEPSEEK_API_KEY",
    });
    expect(byokProviderFromDraft(byokDraft("openrouter"))).toEqual({
      id: "openrouter",
      name: "OpenRouter",
      kind: "openrouter",
      envVar: "OPENROUTER_API_KEY",
    });
    expect(customEnvVar("mi-api")).toBe("BRADBIT_MI_API_API_KEY");
    expect(customEnvVar("  ")).toBe("BRADBIT_PROVIDER_API_KEY");
  });

  it("builds a custom OpenAI-compatible provider", () => {
    const draft = byokDraft("custom");
    draft.id = "mi-api";
    draft.name = "Mi API";
    draft.baseUrl = "https://api.example.com/v1";
    draft.model = "mi-modelo";
    expect(validateByokDraft(draft)).toBeNull();
    expect(byokProviderFromDraft(draft)).toEqual({
      id: "mi-api",
      name: "Mi API",
      kind: "custom",
      baseUrl: "https://api.example.com/v1",
      model: "mi-modelo",
      envVar: "BRADBIT_MI_API_API_KEY",
    });
  });

  it("rejects invalid ids, duplicates and custom endpoints", () => {
    const draft = byokDraft("custom");
    expect(validateByokDraft({ ...draft, id: "bad id" })).toBe("id");
    expect(validateByokDraft({ ...draft, id: "mi-api", name: "" })).toBe(
      "name",
    );
    expect(
      validateByokDraft(
        { ...draft, id: "deepseek", name: "DeepSeek" },
        ["deepseek"],
      ),
    ).toBe("duplicate");
    expect(
      validateByokDraft({
        ...draft,
        id: "mi-api",
        name: "Mi API",
        baseUrl: "file:///tmp/api",
        model: "modelo",
      }),
    ).toBe("baseUrl");
    expect(
      validateByokDraft({
        ...draft,
        id: "mi-api",
        name: "Mi API",
        baseUrl: "https://api.example.com/v1",
        model: " ",
      }),
    ).toBe("model");
  });
});
