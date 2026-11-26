// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../workspace/state";
import { SettingsPanel, SettingsPanelOptions } from "./settingsPanel";

function options(
  overrides: Partial<SettingsPanelOptions> = {},
): SettingsPanelOptions {
  return {
    language: "es",
    settings: { ...DEFAULT_SETTINGS },
    github: {
      account: null,
      tokenPresent: false,
      busy: false,
      error: "",
      tokenDraft: "",
    },
    byok: {
      providers: [],
      keyDrafts: {},
      busyId: null,
      error: "",
    },
    searchAiModels: [],
    searchAiDefaultModel: "DeepSeek · DeepSeek Flash",
    initialCategory: "general",
    initialQuery: "",
    onCategoryChange: vi.fn(),
    onQueryChange: vi.fn(),
    onUpdateSettings: vi.fn(),
    onSaveGitAuthor: vi.fn(),
    onGithubTokenDraft: vi.fn(),
    onConnectGithub: vi.fn(),
    onDisconnectGithub: vi.fn(),
    onOpenGithubTokenPage: vi.fn(),
    onManageModels: vi.fn(),
    onOpenConnectWizard: vi.fn(),
    onByokAdd: vi.fn(),
    onByokRemove: vi.fn(),
    onByokKeyDraft: vi.fn(),
    onByokConnect: vi.fn(),
    onByokDisconnect: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function mount(opts: SettingsPanelOptions): SettingsPanel {
  const panel = new SettingsPanel(opts);
  document.body.appendChild(panel.element);
  return panel;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("settings panel (T-2.4.4)", () => {
  it("renders the category list and the general settings", () => {
    const panel = mount(options());
    expect(
      panel.element.querySelectorAll(".settings-nav-item"),
    ).toHaveLength(5);
    expect(
      panel.element.querySelector('[data-testid="settings-language"]'),
    ).not.toBeNull();
    expect(panel.element.textContent).toContain("General");
  });

  it("switches categories without rebuilding the shell", () => {
    const panel = mount(options());
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-nav-appearance"]',
      )!
      .click();

    expect(
      panel.element.querySelector('[data-testid="settings-theme"]'),
    ).not.toBeNull();
    expect(
      panel.element.querySelector('[data-testid="settings-font-size"]'),
    ).not.toBeNull();
    expect(panel.element.querySelector("h4")?.textContent).toBe("Apariencia");
  });

  it("filters categories and rows from the search field", () => {
    const onQueryChange = vi.fn();
    const onCategoryChange = vi.fn();
    const panel = mount(options({ onQueryChange, onCategoryChange }));
    const search = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-search"]',
    )!;
    search.value = "tema";
    search.dispatchEvent(new Event("input", { bubbles: true }));

    expect(onQueryChange).toHaveBeenCalledWith("tema");
    expect(onCategoryChange).toHaveBeenCalledWith("appearance");
    expect(panel.element.querySelectorAll(".settings-nav-item")).toHaveLength(1);
    expect(
      panel.element.querySelector('[data-testid="settings-theme"]'),
    ).not.toBeNull();
    expect(
      panel.element.querySelector('[data-testid="settings-font-size"]'),
    ).toBeNull();
  });

  it("saves select and switch changes through the settings callback", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(options({ onUpdateSettings }));

    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-nav-appearance"]',
      )!
      .click();
    const theme = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="settings-theme"]',
    )!;
    theme.value = "light";
    theme.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({ theme: "light" });

    const colorTheme = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="settings-color-theme"]',
    )!;
    colorTheme.value = "nord";
    colorTheme.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({ colorTheme: "nord" });

    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-nav-editor"]',
      )!
      .click();
    const wrap = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-word-wrap"]',
    )!;
    wrap.checked = false;
    wrap.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({ wordWrap: false });

    const fountain = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-fountain-autocomplete"]',
    )!;
    fountain.checked = false;
    fountain.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      fountainAutocomplete: false,
    });
  });

  it("hides developer settings by default and reveals them with the toggle", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(options({ onUpdateSettings }));

    expect(
      panel.element.querySelector('[data-testid="settings-nav-terminal"]'),
    ).toBeNull();
    expect(
      panel.element.querySelector('[data-testid="settings-nav-git"]'),
    ).toBeNull();
    expect(
      panel.element.querySelector('[data-testid="settings-nav-files"]'),
    ).toBeNull();

    const toggle = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-developer-options"]',
    )!;
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      showDeveloperOptions: true,
    });

    const visible = mount(
      options({
        settings: { ...DEFAULT_SETTINGS, showDeveloperOptions: true },
      }),
    );
    expect(
      visible.element.querySelectorAll(".settings-nav-item"),
    ).toHaveLength(8);
    expect(
      visible.element.querySelector('[data-testid="settings-nav-terminal"]'),
    ).not.toBeNull();
    expect(
      visible.element.querySelector('[data-testid="settings-nav-git"]'),
    ).not.toBeNull();
  });

  it("opens the guided model connection wizard from AI settings", () => {
    const onOpenConnectWizard = vi.fn();
    const panel = mount(
      options({
        settings: { ...DEFAULT_SETTINGS, showDeveloperOptions: true },
        initialCategory: "models",
        onOpenConnectWizard,
      }),
    );
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-byok-wizard"]',
      )!
      .click();
    expect(onOpenConnectWizard).toHaveBeenCalled();
  });

  it("supports custom terminal commands", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(
      options({
        settings: {
          ...DEFAULT_SETTINGS,
          showDeveloperOptions: true,
          terminalCommand: "shell",
        },
        initialCategory: "terminal",
        onUpdateSettings,
      }),
    );
    const select = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="settings-terminal-command"]',
    )!;
    select.value = "custom";
    select.dispatchEvent(new Event("change", { bubbles: true }));

    const input = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-terminal-custom"]',
    )!;
    input.value = "npm run dev";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-terminal-custom-save"]',
      )!
      .click();

    expect(onUpdateSettings).toHaveBeenCalledWith({
      terminalCommand: "npm run dev",
    });
  });

  it("saves the Git author and opens model management", () => {
    const onSaveGitAuthor = vi.fn();
    const onManageModels = vi.fn();
    const panel = mount(
      options({
        settings: { ...DEFAULT_SETTINGS, showDeveloperOptions: true },
        onSaveGitAuthor,
        onManageModels,
      }),
    );

    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="settings-nav-git"]')!
      .click();
    const name = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-git-author-name"]',
    )!;
    const email = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-git-author-email"]',
    )!;
    name.value = "Ada Lovelace";
    email.value = "ada@example.com";
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-git-author-save"]',
      )!
      .click();
    expect(onSaveGitAuthor).toHaveBeenCalledWith(
      "Ada Lovelace",
      "ada@example.com",
    );

    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="settings-nav-models"]')!
      .click();
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="settings-manage-models"]',
      )!
      .click();
    expect(onManageModels).toHaveBeenCalledOnce();
  });

  it("lets the user choose the AI search model", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(
      options({
        initialCategory: "models",
        searchAiModels: [
          {
            value: "deepseek/deepseek-flash",
            label: "DeepSeek · DeepSeek Flash",
          },
        ],
        onUpdateSettings,
      }),
    );
    const select = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="settings-search-ai-model"]',
    )!;
    expect(select.value).toBe("");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Predeterminado (modelo del chat)",
      "DeepSeek · DeepSeek Flash",
    ]);
    expect(
      panel.element.querySelector('[data-testid="settings-search-ai-current"]')!
        .textContent,
    ).toBe("Ahora: DeepSeek · DeepSeek Flash");
    const controls = panel.element.querySelector(
      ".settings-search-ai-controls",
    )!;
    expect(
      controls.querySelector('[data-testid="settings-search-ai-model"]'),
    ).not.toBeNull();
    expect(
      controls.querySelector('[data-testid="settings-search-ai-effort"]'),
    ).not.toBeNull();

    select.value = "deepseek/deepseek-flash";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      searchAiModel: "deepseek/deepseek-flash",
    });
  });

  it("lets the user choose the AI reasoning effort", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(
      options({ initialCategory: "models", onUpdateSettings }),
    );
    const select = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="settings-search-ai-effort"]',
    )!;
    expect(select.value).toBe("low");
    expect([...select.options].map((option) => option.textContent)).toEqual([
      "Sin razonamiento",
      "Bajo (predeterminado)",
      "Alto",
      "Máximo",
    ]);

    expect(
      select.closest(".settings-search-ai-controls"),
    ).not.toBeNull();
    expect(
      panel.element.querySelectorAll(
        '[data-testid="settings-search-ai-effort"]',
      ),
    ).toHaveLength(1);
    select.value = "none";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({ searchAiEffort: "none" });
  });

  it("keeps an unavailable saved AI search model visible", () => {
    const panel = mount(
      options({
        initialCategory: "models",
        settings: {
          ...DEFAULT_SETTINGS,
          searchAiModel: "deepseek/old-model",
        },
        searchAiModels: [],
      }),
    );
    const select = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="settings-search-ai-model"]',
    )!;
    expect(select.value).toBe("deepseek/old-model");
    expect(select.selectedOptions[0]?.textContent).toBe("Modelo no disponible");
  });

  it("offers developer Git terms only with developer options enabled", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(
      options({
        settings: { ...DEFAULT_SETTINGS, showDeveloperOptions: true },
        initialCategory: "git",
        onUpdateSettings,
      }),
    );
    const toggle = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-git-developer-terms"]',
    )!;
    expect(toggle).not.toBeNull();
    toggle.checked = true;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    expect(onUpdateSettings).toHaveBeenCalledWith({
      gitDeveloperTerms: true,
    });

    const hidden = mount(
      options({
        settings: { ...DEFAULT_SETTINGS, showDeveloperOptions: false },
        initialCategory: "git",
      }),
    );
    expect(
      hidden.element.querySelector(
        '[data-testid="settings-git-developer-terms"]',
      ),
    ).toBeNull();
  });

  it("enables GitHub connect as soon as a token is typed", () => {
    const onGithubTokenDraft = vi.fn();
    const onConnectGithub = vi.fn();
    const panel = mount(
      options({
        initialCategory: "github",
        onGithubTokenDraft,
        onConnectGithub,
      }),
    );
    const token = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-github-token"]',
    )!;
    const connect = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="settings-github-connect"]',
    )!;
    expect(connect.disabled).toBe(true);

    token.value = "ghp_test_token";
    token.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onGithubTokenDraft).toHaveBeenCalledWith("ghp_test_token");
    expect(connect.disabled).toBe(false);

    connect.click();
    expect(onConnectGithub).toHaveBeenCalledOnce();
  });

  it("manages BYOK providers, keys and custom endpoints (T-3.1.9)", () => {
    const onByokKeyDraft = vi.fn();
    const onByokConnect = vi.fn();
    const onByokDisconnect = vi.fn();
    const onByokAdd = vi.fn();
    const panel = mount(
      options({
        initialCategory: "models",
        byok: {
          providers: [
            {
              id: "deepseek",
              name: "DeepSeek",
              kind: "deepseek",
              envVar: "DEEPSEEK_API_KEY",
              hasKey: true,
            },
            {
              id: "mi-api",
              name: "Mi API",
              kind: "custom",
              baseUrl: "https://api.example.com/v1",
              model: "mi-modelo",
              envVar: "BRADBIT_MI_API_API_KEY",
              hasKey: false,
            },
          ],
          keyDrafts: {},
          busyId: null,
          error: "",
        },
        onByokKeyDraft,
        onByokConnect,
        onByokDisconnect,
        onByokAdd,
      }),
    );

    expect(panel.element.textContent).toContain("Proveedores y claves");
    expect(panel.element.textContent).toContain("Conectado");
    expect(panel.element.textContent).toContain("Sin clave");
    expect(panel.element.textContent).toContain("DEEPSEEK_API_KEY");

    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="byok-disconnect-deepseek"]')
      ?.click();
    expect(onByokDisconnect).toHaveBeenCalledWith("deepseek");

    const key = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="byok-key-mi-api"]',
    )!;
    const connect = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="byok-connect-mi-api"]',
    )!;
    expect(connect.disabled).toBe(true);
    key.value = "sk-test";
    key.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onByokKeyDraft).toHaveBeenCalledWith("mi-api", "sk-test");
    expect(connect.disabled).toBe(false);
    connect.click();
    expect(onByokConnect).toHaveBeenCalledWith("mi-api");

    const kind = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="byok-add-kind"]',
    )!;
    kind.value = "custom";
    kind.dispatchEvent(new Event("change", { bubbles: true }));
    const id = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="byok-add-id"]',
    )!;
    const name = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="byok-add-name"]',
    )!;
    const baseUrl = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="byok-add-base-url"]',
    )!;
    const model = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="byok-add-model"]',
    )!;
    id.value = "otro";
    name.value = "Otro";
    baseUrl.value = "https://api.otro.com/v1";
    model.value = "otro-modelo";
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="byok-add-submit"]')
      ?.click();
    expect(onByokAdd).toHaveBeenCalledWith({
      kind: "custom",
      id: "otro",
      name: "Otro",
      baseUrl: "https://api.otro.com/v1",
      model: "otro-modelo",
    });
  });

  it("shows a no-results state and closes from the header", () => {
    const onClose = vi.fn();
    const panel = mount(options({ onClose }));
    const search = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="settings-search"]',
    )!;
    search.value = "zzzz-no-setting";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(panel.element.textContent).toContain("No se encontraron ajustes.");

    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="settings-close"]')!
      .click();
    expect(onClose).toHaveBeenCalledOnce();
  });
});
