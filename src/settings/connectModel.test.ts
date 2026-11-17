// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ByokProvider } from "../types";
import { ConnectModelPanel, validateApiKey } from "./connectModel";

function mount(
  options: Partial<ConstructorParameters<typeof ConnectModelPanel>[0]> = {},
) {
  const panel = new ConnectModelPanel({
    language: "es",
    providers: [],
    onClose: vi.fn(),
    onTest: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      modelCount: 2,
    }),
    onSave: vi.fn().mockResolvedValue(undefined),
    onOpenKeyPage: vi.fn(),
    ...options,
  });
  document.body.appendChild(panel.element);
  return { panel, element: panel.element };
}

function input(
  element: HTMLElement,
  testId: string,
  value: string,
): HTMLInputElement {
  const field = element.querySelector<HTMLInputElement>(
    `[data-testid="${testId}"]`,
  )!;
  field.value = value;
  field.dispatchEvent(new Event("input", { bubbles: true }));
  return field;
}

function select(element: HTMLElement, value: string): HTMLSelectElement {
  const field = element.querySelector<HTMLSelectElement>(
    '[data-testid="connect-model-kind"]',
  )!;
  field.value = value;
  field.dispatchEvent(new Event("change", { bubbles: true }));
  return field;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("connect model wizard (T-3.5.5)", () => {
  it("validates API keys before testing", () => {
    expect(validateApiKey("")).toBe("empty");
    expect(validateApiKey("   ")).toBe("empty");
    expect(validateApiKey("sk-good")).toBeNull();
    expect(validateApiKey("sk-\nkey")).toBe("invalid");
    expect(validateApiKey("x".repeat(16_385))).toBe("too-long");
  });

  it("opens the provider key page and shows the configured state", () => {
    const provider: ByokProvider = {
      id: "deepseek",
      name: "DeepSeek",
      kind: "deepseek",
      envVar: "DEEPSEEK_API_KEY",
    };
    const onOpenKeyPage = vi.fn();
    const { element } = mount({ providers: [provider], onOpenKeyPage });

    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-key-link"]',
      )!
      .click();
    expect(onOpenKeyPage).toHaveBeenCalledWith(
      "https://platform.deepseek.com/api_keys",
    );
    const badge = element.querySelector(".connect-model-configured");
    expect(badge?.hasAttribute("hidden")).toBe(false);
  });

  it("reports an invalid key and keeps saving disabled", async () => {
    const onTest = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      modelCount: 0,
      error: "Incorrect API key",
    });
    const { element } = mount({ onTest });
    input(element, "connect-model-key", "bad-key");
    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-test"]',
      )!
      .click();

    await vi.waitFor(() => {
      expect(
        element.querySelector('[data-testid="connect-model-result"]')
          ?.textContent,
      ).toContain("clave no es válida");
    });
    expect(
      element.querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-save"]',
      )?.disabled,
    ).toBe(true);
  });

  it("tests successfully and saves the exact draft", async () => {
    const onTest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      modelCount: 3,
    });
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { element } = mount({ onTest, onSave });
    input(element, "connect-model-key", "  sk-deepseek  ");
    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-test"]',
      )!
      .click();

    await vi.waitFor(() => {
      expect(
        element.querySelector('[data-testid="connect-model-result"]')
          ?.textContent,
      ).toContain("3 modelos");
    });
    const save = element.querySelector<HTMLButtonElement>(
      '[data-testid="connect-model-save"]',
    )!;
    expect(save.disabled).toBe(false);
    save.click();
    await vi.waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "deepseek",
          id: "deepseek",
          name: "DeepSeek",
          key: "  sk-deepseek  ",
        }),
      ),
    );
  });

  it("supports custom OpenAI-compatible providers", async () => {
    const onTest = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      modelCount: 0,
    });
    const { element } = mount({ onTest });
    select(element, "custom");
    input(element, "connect-model-name", "Mi API");
    input(element, "connect-model-id", "mi-api");
    input(element, "connect-model-base-url", "https://api.example.com/v1");
    input(element, "connect-model-model", "mi-modelo");
    input(element, "connect-model-key", "sk-custom");
    expect(
      element.querySelector<HTMLElement>(
        '[data-testid="connect-model-custom"]',
      )?.hasAttribute("hidden"),
    ).toBe(false);
    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-test"]',
      )!
      .click();

    await vi.waitFor(() =>
      expect(onTest).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "custom",
          id: "mi-api",
          name: "Mi API",
          baseUrl: "https://api.example.com/v1",
          model: "mi-modelo",
          key: "sk-custom",
        }),
      ),
    );
  });

  it("can save without testing after a deliberate click", async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const { element } = mount({ onSave });
    input(element, "connect-model-key", "sk-deepseek");
    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-save-untested"]',
      )!
      .click();
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
  });

  it("renders in English", () => {
    const { element } = mount({ language: "en" });
    expect(
      element.querySelector(".connect-model-subtitle")?.textContent,
    ).toContain("Choose a provider");
    expect(
      element.querySelector<HTMLButtonElement>(
        '[data-testid="connect-model-test"]',
      )?.textContent,
    ).toBe("Test connection");
  });
});
