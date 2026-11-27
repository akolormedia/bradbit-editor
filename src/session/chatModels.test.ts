import { describe, expect, it } from "vitest";
import { ByokProviderStatus, OpenCodeModel } from "../types";
import { filterChatModelsByKeys } from "./chatModels";

const provider = (
  id: string,
  hasKey: boolean,
): ByokProviderStatus => ({
  id,
  name: id,
  kind: id === "opencode" ? "opencode" : "custom",
  envVar: `${id.toUpperCase()}_API_KEY`,
  hasKey,
});

const model = (providerId: string, id: string): OpenCodeModel => ({
  id,
  name: id,
  providerId,
  variants: [],
});

describe("chat models with keys", () => {
  it("keeps only models from providers with a key", () => {
    const models = [
      model("deepseek", "deepseek-flash"),
      model("openrouter", "free-model"),
      model("openai", "gpt-5"),
    ];
    expect(
      filterChatModelsByKeys(models, [
        provider("deepseek", true),
        provider("openai", false),
      ]),
    ).toEqual([models[0]]);
  });

  it("maps the OpenCode provider to its Go models", () => {
    const models = [
      model("opencode", "zen"),
      model("opencode-go", "beam-free"),
    ];
    expect(
      filterChatModelsByKeys(models, [provider("opencode", true)]),
    ).toEqual(models);
  });

  it("returns nothing when no provider has a key", () => {
    expect(
      filterChatModelsByKeys(
        [model("deepseek", "deepseek-flash")],
        [provider("deepseek", false)],
      ),
    ).toEqual([]);
  });
});
