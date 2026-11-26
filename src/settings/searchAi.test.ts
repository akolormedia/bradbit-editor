import { describe, expect, it } from "vitest";
import {
  buildSearchAiModelOptions,
  configuredSearchAiTarget,
  parseSearchAiModel,
  searchAiErrorKind,
  searchAiModelKey,
  supportsSearchAi,
} from "./searchAi";
import { ByokProviderStatus, OpenCodeModel } from "../types";

const provider = (
  id: string,
  name: string,
  hasKey: boolean,
  model?: string,
): ByokProviderStatus => ({
  id,
  name,
  kind: id === "openrouter" ? "openrouter" : "deepseek",
  envVar: `${id.toUpperCase()}_API_KEY`,
  hasKey,
  model,
});

const model = (
  providerId: string,
  id: string,
  name = id,
): OpenCodeModel => ({ providerId, id, name, variants: [] });

describe("search AI model settings", () => {
  it("builds keys and parses provider/model values", () => {
    expect(searchAiModelKey("deepseek", "deepseek-flash")).toBe(
      "deepseek/deepseek-flash",
    );
    expect(parseSearchAiModel("deepseek/deepseek-flash")).toEqual({
      providerId: "deepseek",
      model: "deepseek-flash",
    });
    expect(parseSearchAiModel("openrouter/baidu/ernie-5.5#high")).toEqual({
      providerId: "openrouter",
      model: "baidu/ernie-5.5",
    });
    expect(parseSearchAiModel("deepseek")).toBeNull();
    expect(parseSearchAiModel("/model")).toBeNull();
    expect(parseSearchAiModel("provider/")).toBeNull();
  });

  it("lists only models from providers with a connected key", () => {
    const options = buildSearchAiModelOptions(
      [provider("deepseek", "DeepSeek", true), provider("openai", "OpenAI", false)],
      [
        model("deepseek", "deepseek-flash", "DeepSeek Flash"),
        model("openai", "gpt-5", "GPT-5"),
        model("opencode-go", "beam-free", "Beam Free"),
      ],
    );
    expect(options).toEqual([
      { value: "deepseek/deepseek-flash", label: "DeepSeek · DeepSeek Flash" },
    ]);
  });

  it("adds recent models and the provider model without duplicates", () => {
    const options = buildSearchAiModelOptions(
      [
        provider("deepseek", "DeepSeek", true, "deepseek-flash"),
        provider("openrouter", "OpenRouter", true, "custom-model"),
      ],
      [model("deepseek", "deepseek-flash", "DeepSeek Flash")],
      [
        "deepseek/deepseek-flash",
        "openrouter/baidu/ernie-5.5:free",
        "opencode-go/beam-free",
      ],
    );
    expect(options).toEqual([
      { value: "deepseek/deepseek-flash", label: "DeepSeek · DeepSeek Flash" },
      {
        value: "openrouter/baidu/ernie-5.5:free",
        label: "OpenRouter · baidu/ernie-5.5:free",
      },
      {
        value: "openrouter/custom-model",
        label: "OpenRouter · custom-model",
      },
    ]);
  });

  it("classifies empty and truncated completion errors", () => {
    expect(
      searchAiErrorKind("The model returned an empty answer. Try another model."),
    ).toBe("empty");
    expect(
      searchAiErrorKind("The model ran out of tokens before answering."),
    ).toBe("truncated");
    expect(searchAiErrorKind("HTTP 401: invalid key")).toBeNull();
  });

  it("excludes providers that cannot run direct completions", () => {
    const opencode: ByokProviderStatus = {
      ...provider("opencode", "OpenCode", true, "beam-free"),
      kind: "opencode",
    };
    expect(supportsSearchAi("opencode")).toBe(false);
    expect(
      buildSearchAiModelOptions([opencode], [model("opencode", "beam-free")]),
    ).toEqual([]);
    expect(configuredSearchAiTarget("opencode/beam-free", [opencode])).toBeNull();
  });

  it("resolves a configured model only while its provider is connected", () => {
    const providers = [provider("deepseek", "DeepSeek", true)];
    expect(configuredSearchAiTarget("deepseek/deepseek-flash", providers)).toEqual(
      { providerId: "deepseek", model: "deepseek-flash" },
    );
    expect(configuredSearchAiTarget("deepseek/deepseek-flash", [])).toBeNull();
    expect(
      configuredSearchAiTarget(
        "deepseek/deepseek-flash",
        [provider("deepseek", "DeepSeek", false)],
      ),
    ).toBeNull();
  });
});
