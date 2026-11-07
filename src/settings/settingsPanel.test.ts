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
    ).toHaveLength(8);
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
  });

  it("supports custom terminal commands", () => {
    const onUpdateSettings = vi.fn();
    const panel = mount(
      options({
        settings: { ...DEFAULT_SETTINGS, terminalCommand: "shell" },
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
    const panel = mount(options({ onSaveGitAuthor, onManageModels }));

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
