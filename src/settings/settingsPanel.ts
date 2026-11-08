import { t } from "../i18n";
import { AppSettings, Language } from "../types";
import { COLOR_THEMES, ColorThemeId } from "../theme/palettes";
import { createIcon } from "../ui/icons";
import { createIconButton } from "../ui/iconButton";
import {
  matchingCategoryIds,
  SETTINGS_CATEGORIES,
  SettingsCategoryId,
  visibleEntriesForCategory,
} from "./catalog";

const TERMINAL_PRESETS = ["shell", "opencode", "claude"] as const;

function isTerminalPreset(value: string): boolean {
  return (TERMINAL_PRESETS as readonly string[]).includes(value);
}

export interface SettingsGithubState {
  account: string | null;
  tokenPresent: boolean;
  busy: boolean;
  error: string;
  tokenDraft: string;
}

export interface SettingsPanelOptions {
  language: Language;
  settings: AppSettings;
  github: SettingsGithubState;
  initialCategory: SettingsCategoryId;
  initialQuery: string;
  modalError?: string;
  onCategoryChange: (category: SettingsCategoryId) => void;
  onQueryChange: (query: string) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onSaveGitAuthor: (name: string, email: string) => void;
  onGithubTokenDraft: (value: string) => void;
  onConnectGithub: () => void;
  onDisconnectGithub: () => void;
  onOpenGithubTokenPage: () => void;
  onManageModels: () => void;
  onClose: () => void;
}

/**
 * Zed-style settings surface: a searchable category list on the left and the
 * active category's controls on the right. Search only rebuilds the nav and
 * content, so typing never loses focus in the search field.
 */
export class SettingsPanel {
  public readonly element: HTMLElement;

  private readonly options: SettingsPanelOptions;
  private readonly navEl: HTMLElement;
  private readonly contentEl: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly clearSearchBtn: HTMLButtonElement;
  private query: string;
  private activeCategory: SettingsCategoryId;
  private customTerminal: string;
  private terminalCustomSelected: boolean;

  constructor(options: SettingsPanelOptions) {
    this.options = options;
    this.query = options.initialQuery;
    this.activeCategory = options.initialCategory;
    this.customTerminal = isTerminalPreset(options.settings.terminalCommand)
      ? ""
      : options.settings.terminalCommand;
    this.terminalCustomSelected = !isTerminalPreset(
      options.settings.terminalCommand,
    );

    this.element = document.createElement("div");
    this.element.className = "settings-shell";

    const header = document.createElement("header");
    header.className = "settings-header";
    const title = document.createElement("h3");
    title.textContent = t(options.language, "settings");
    const closeBtn = createIconButton({
      icon: "x",
      label: t(options.language, "close"),
      className: "settings-close-btn",
      testId: "settings-close",
      onClick: () => this.options.onClose(),
    });
    header.append(title, closeBtn);

    const body = document.createElement("div");
    body.className = "settings-body";

    const sidebar = document.createElement("aside");
    sidebar.className = "settings-sidebar";
    const searchWrap = document.createElement("div");
    searchWrap.className = "settings-search";
    const searchIcon = document.createElement("span");
    searchIcon.className = "settings-search-icon";
    searchIcon.appendChild(createIcon("search", 14));
    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.className = "settings-search-input";
    this.searchInput.dataset.testid = "settings-search";
    this.searchInput.autocomplete = "off";
    this.searchInput.spellcheck = false;
    this.searchInput.setAttribute("autocorrect", "off");
    this.searchInput.setAttribute("autocapitalize", "off");
    this.searchInput.placeholder = t(
      options.language,
      "settingsSearchPlaceholder",
    );
    this.searchInput.value = this.query;
    this.searchInput.oninput = () => {
      this.query = this.searchInput.value;
      this.options.onQueryChange(this.query);
      this.refresh();
    };
    this.clearSearchBtn = createIconButton({
      icon: "x",
      label: t(options.language, "close"),
      className: "settings-search-clear",
      testId: "settings-search-clear",
      plain: true,
      onClick: () => {
        this.query = "";
        this.searchInput.value = "";
        this.options.onQueryChange("");
        this.refresh();
        this.searchInput.focus();
      },
    });
    searchWrap.append(searchIcon, this.searchInput, this.clearSearchBtn);

    this.navEl = document.createElement("nav");
    this.navEl.className = "settings-nav";
    this.navEl.setAttribute("aria-label", t(options.language, "settings"));
    sidebar.append(searchWrap, this.navEl);

    this.contentEl = document.createElement("section");
    this.contentEl.className = "settings-content";

    body.append(sidebar, this.contentEl);
    this.element.append(header, body);

    this.refresh();
  }

  private refresh(): void {
    const matches = matchingCategoryIds(
      this.options.language,
      this.query,
    );
    if (
      this.query.trim() &&
      matches.length > 0 &&
      !matches.includes(this.activeCategory)
    ) {
      this.activeCategory = matches[0];
      this.options.onCategoryChange(this.activeCategory);
    }

    this.renderNav(matches);
    this.renderContent();
    this.clearSearchBtn.hidden = this.query.length === 0;
  }

  private renderNav(matches: SettingsCategoryId[]): void {
    this.navEl.replaceChildren();
    for (const category of SETTINGS_CATEGORIES) {
      if (!matches.includes(category.id)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "settings-nav-item";
      button.dataset.settingsCategory = category.id;
      button.dataset.testid = `settings-nav-${category.id}`;
      button.classList.toggle("active", category.id === this.activeCategory);
      button.setAttribute(
        "aria-current",
        category.id === this.activeCategory ? "page" : "false",
      );
      button.append(
        createIcon(category.icon, 15),
        document.createTextNode(t(this.options.language, category.labelKey)),
      );
      button.onclick = () => {
        this.activeCategory = category.id;
        this.options.onCategoryChange(category.id);
        this.refresh();
        this.navEl
          .querySelector<HTMLButtonElement>(
            `[data-settings-category="${category.id}"]`,
          )
          ?.focus();
      };
      this.navEl.appendChild(button);
    }
  }

  private renderContent(): void {
    this.contentEl.replaceChildren();

    if (this.options.modalError) {
      const error = document.createElement("div");
      error.className = "error-banner";
      error.textContent = this.options.modalError;
      this.contentEl.appendChild(error);
    }

    const matches = matchingCategoryIds(this.options.language, this.query);
    if (matches.length === 0) {
      this.contentEl.appendChild(
        this.emptyMessage(t(this.options.language, "settingsNoResults")),
      );
      return;
    }

    const category = SETTINGS_CATEGORIES.find(
      (item) => item.id === this.activeCategory,
    );
    if (!category) return;

    const entries = visibleEntriesForCategory(
      this.activeCategory,
      this.options.language,
      this.query,
    );
    if (entries.length === 0) {
      this.contentEl.appendChild(
        this.emptyMessage(t(this.options.language, "settingsNoResults")),
      );
      return;
    }

    const heading = document.createElement("h4");
    heading.className = "settings-category-title";
    heading.textContent = t(this.options.language, category.labelKey);
    this.contentEl.appendChild(heading);

    const has = (id: string) => entries.some((entry) => entry.id === id);

    switch (this.activeCategory) {
      case "general":
        this.renderGeneral(has);
        break;
      case "appearance":
        this.renderAppearance(has);
        break;
      case "editor":
        this.renderEditor(has);
        break;
      case "files":
        this.renderFiles(has);
        break;
      case "terminal":
        this.renderTerminal(has);
        break;
      case "git":
        this.renderGit(has);
        break;
      case "github":
        this.renderGithub(has);
        break;
      case "models":
        this.renderModels(has);
        break;
    }
  }

  private renderGeneral(has: (id: string) => boolean): void {
    if (!has("language")) return;
    const select = this.selectControl(
      "settings-language",
      [
        { value: "es", label: "Español" },
        { value: "en", label: "English" },
      ],
      this.options.settings.language,
      (value) =>
        this.options.onUpdateSettings({ language: value as Language }),
    );
    this.contentEl.appendChild(
      this.row(
        t(this.options.language, "language"),
        t(this.options.language, "settingsLanguageHint"),
        select,
      ),
    );
  }

  private renderAppearance(has: (id: string) => boolean): void {
    if (has("theme")) {
      const theme = this.selectControl(
        "settings-theme",
        [
          {
            value: "dark",
            label: t(this.options.language, "themeDark"),
          },
          {
            value: "light",
            label: t(this.options.language, "themeLight"),
          },
          {
            value: "system",
            label: t(this.options.language, "themeSystem"),
          },
        ],
        this.options.settings.theme,
        (value) =>
          this.options.onUpdateSettings({
            theme: value as AppSettings["theme"],
          }),
      );
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "theme"),
          t(this.options.language, "settingsThemeHint"),
          theme,
        ),
      );
    }

    if (has("colorTheme")) {
      const colorTheme = this.selectControl(
        "settings-color-theme",
        COLOR_THEMES.map((theme) => ({
          value: theme.id,
          label: t(this.options.language, theme.labelKey),
        })),
        this.options.settings.colorTheme,
        (value) =>
          this.options.onUpdateSettings({
            colorTheme: value as ColorThemeId,
          }),
      );
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "colorTheme"),
          t(this.options.language, "colorThemeHint"),
          colorTheme,
        ),
      );
    }

    if (has("fontSize")) {
      const control = document.createElement("div");
      control.className = "settings-range-wrap";
      const value = document.createElement("span");
      value.className = "settings-range-value";
      value.textContent = `${this.options.settings.fontSize}px`;
      const range = document.createElement("input");
      range.type = "range";
      range.className = "settings-range";
      range.dataset.testid = "settings-font-size";
      range.setAttribute(
        "aria-label",
        t(this.options.language, "fontSize"),
      );
      range.min = "12";
      range.max = "24";
      range.value = String(this.options.settings.fontSize);
      range.oninput = () => {
        value.textContent = `${range.value}px`;
      };
      range.onchange = () =>
        this.options.onUpdateSettings({ fontSize: Number(range.value) });
      control.append(range, value);
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "fontSize"),
          t(this.options.language, "settingsFontSizeHint"),
          control,
        ),
      );
    }
  }

  private renderEditor(has: (id: string) => boolean): void {
    if (has("wordWrap")) {
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "wordWrap"),
          t(this.options.language, "settingsWordWrapHint"),
          this.switchControl(
            "settings-word-wrap",
            this.options.settings.wordWrap,
            (checked) => this.options.onUpdateSettings({ wordWrap: checked }),
            t(this.options.language, "wordWrap"),
          ),
        ),
      );
    }
    if (has("lineNumbers")) {
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "lineNumbers"),
          t(this.options.language, "settingsLineNumbersHint"),
          this.switchControl(
            "settings-line-numbers",
            this.options.settings.lineNumbers,
            (checked) => this.options.onUpdateSettings({ lineNumbers: checked }),
            t(this.options.language, "lineNumbers"),
          ),
        ),
      );
    }
  }

  private renderFiles(has: (id: string) => boolean): void {
    if (!has("showConfigFiles")) return;
    this.contentEl.appendChild(
      this.row(
        t(this.options.language, "showConfigFiles"),
        t(this.options.language, "settingsShowConfigFilesHint"),
        this.switchControl(
          "settings-config-files",
          this.options.settings.showConfigFiles,
          (checked) => this.options.onUpdateSettings({ showConfigFiles: checked }),
          t(this.options.language, "showConfigFiles"),
        ),
      ),
    );
  }

  private renderTerminal(has: (id: string) => boolean): void {
    if (!has("terminalCommand")) return;
    const current = this.options.settings.terminalCommand;
    const preset = this.terminalCustomSelected ? "custom" : current;
    const select = this.selectControl(
      "settings-terminal-command",
      [
        {
          value: "shell",
          label: t(this.options.language, "terminalCommandShell"),
        },
        {
          value: "opencode",
          label: t(this.options.language, "terminalCommandOpenCode"),
        },
        {
          value: "claude",
          label: t(this.options.language, "terminalCommandClaude"),
        },
        {
          value: "custom",
          label: t(this.options.language, "terminalCommandCustom"),
        },
      ],
      preset,
      (value) => {
        if (value === "custom") {
          this.terminalCustomSelected = true;
          this.customTerminal = isTerminalPreset(current) ? "" : current;
          this.renderContent();
          this.contentEl
            .querySelector<HTMLInputElement>(
              '[data-testid="settings-terminal-custom"]',
            )
            ?.focus();
          return;
        }
        this.terminalCustomSelected = false;
        this.options.onUpdateSettings({ terminalCommand: value });
      },
    );
    this.contentEl.appendChild(
      this.row(
        t(this.options.language, "settingsTerminalCommand"),
        t(this.options.language, "settingsTerminalCommandHint"),
        select,
      ),
    );

    if (preset === "custom") {
      const group = document.createElement("div");
      group.className = "settings-control-group";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "settings-text-input";
      input.dataset.testid = "settings-terminal-custom";
      input.value = this.customTerminal;
      input.placeholder = t(
        this.options.language,
        "settingsTerminalCustomPlaceholder",
      );
      input.onkeydown = (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          this.saveCustomTerminal();
        }
      };
      const save = document.createElement("button");
      save.type = "button";
      save.className = "toolbar-btn primary";
      save.dataset.testid = "settings-terminal-custom-save";
      save.textContent = t(this.options.language, "save");
      save.disabled = !this.customTerminal.trim();
      save.onclick = () => this.saveCustomTerminal();
      input.oninput = () => {
        this.customTerminal = input.value;
        save.disabled = !this.customTerminal.trim();
      };
      group.append(input, save);
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "settingsTerminalCustom"),
          t(this.options.language, "settingsTerminalCustomPlaceholder"),
          group,
        ),
      );
    }
  }

  private saveCustomTerminal(): void {
    const value = this.customTerminal.trim();
    if (!value) return;
    this.options.onUpdateSettings({ terminalCommand: value });
  }

  private renderGit(has: (id: string) => boolean): void {
    const group = document.createElement("div");
    group.className = "settings-control-stack";

    if (has("gitAuthorName")) {
      const name = document.createElement("input");
      name.type = "text";
      name.className = "settings-text-input";
      name.dataset.testid = "settings-git-author-name";
      name.value = this.options.settings.gitAuthorName;
      name.placeholder = "Ada Lovelace";
      group.appendChild(name);
    }
    if (has("gitAuthorEmail")) {
      const email = document.createElement("input");
      email.type = "email";
      email.className = "settings-text-input";
      email.dataset.testid = "settings-git-author-email";
      email.value = this.options.settings.gitAuthorEmail;
      email.placeholder = "ada@example.com";
      group.appendChild(email);
    }

    const save = document.createElement("button");
    save.type = "button";
    save.className = "toolbar-btn primary";
    save.dataset.testid = "settings-git-author-save";
    save.textContent = t(this.options.language, "save");
    save.onclick = () => {
      const name =
        group.querySelector<HTMLInputElement>(
          '[data-testid="settings-git-author-name"]',
        )?.value ?? this.options.settings.gitAuthorName;
      const email =
        group.querySelector<HTMLInputElement>(
          '[data-testid="settings-git-author-email"]',
        )?.value ?? this.options.settings.gitAuthorEmail;
      this.options.onSaveGitAuthor(name, email);
    };
    group.appendChild(save);

    this.contentEl.appendChild(
      this.row(
        t(this.options.language, "gitAuthorSection"),
        t(this.options.language, "gitAuthorHint"),
        group,
      ),
    );
  }

  private renderGithub(has: (id: string) => boolean): void {
    const github = this.options.github;
    if (github.error) {
      const error = document.createElement("div");
      error.className = "error-banner";
      error.textContent = github.error;
      this.contentEl.appendChild(error);
    }

    if (github.account) {
      if (!has("githubAccount")) return;
      const connected = document.createElement("span");
      connected.className = "settings-github-status";
      connected.textContent = t(this.options.language, "githubConnectedAs", {
        login: github.account,
      });
      const disconnect = document.createElement("button");
      disconnect.type = "button";
      disconnect.className = "toolbar-btn";
      disconnect.dataset.testid = "settings-github-disconnect";
      disconnect.disabled = github.busy;
      disconnect.textContent = t(
        this.options.language,
        github.busy ? "githubDisconnecting" : "githubDisconnect",
      );
      disconnect.onclick = () => this.options.onDisconnectGithub();
      const group = document.createElement("div");
      group.className = "settings-control-group";
      group.append(connected, disconnect);
      this.contentEl.appendChild(
        this.row(
          t(this.options.language, "githubAccountSection"),
          t(this.options.language, "githubConnectHint"),
          group,
        ),
      );
      return;
    }

    if (!has("githubToken") && !has("githubAccount")) return;

    const group = document.createElement("div");
    group.className = "settings-control-stack";
    const token = document.createElement("input");
    token.type = "password";
    token.className = "settings-text-input";
    token.dataset.testid = "settings-github-token";
    token.autocomplete = "off";
    token.spellcheck = false;
    token.value = github.tokenDraft;
    token.placeholder = t(this.options.language, "githubTokenPlaceholder");
    token.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.options.onConnectGithub();
      }
    };
    group.appendChild(token);

    const hint = document.createElement("p");
    hint.className = "settings-hint";
    hint.textContent = t(this.options.language, "githubTokenHint");
    group.appendChild(hint);

    const actions = document.createElement("div");
    actions.className = "settings-control-group";
    const connect = document.createElement("button");
    connect.type = "button";
    connect.className = "toolbar-btn primary";
    connect.dataset.testid = "settings-github-connect";
    connect.disabled = github.busy || !github.tokenDraft.trim();
    connect.textContent = t(
      this.options.language,
      github.busy ? "githubConnecting" : "githubConnectAction",
    );
    connect.onclick = () => this.options.onConnectGithub();
    token.oninput = () => {
      this.options.onGithubTokenDraft(token.value);
      connect.disabled = github.busy || !token.value.trim();
    };

    const createToken = document.createElement("button");
    createToken.type = "button";
    createToken.className = "versions-link-btn";
    createToken.dataset.testid = "settings-github-token-link";
    createToken.textContent = t(this.options.language, "githubCreateToken");
    createToken.onclick = () => this.options.onOpenGithubTokenPage();
    actions.append(connect, createToken);
    group.appendChild(actions);

    this.contentEl.appendChild(
      this.row(
        t(this.options.language, "githubAccountSection"),
        t(this.options.language, "githubConnectHint"),
        group,
      ),
    );
  }

  private renderModels(has: (id: string) => boolean): void {
    if (!has("models")) return;
    const group = document.createElement("div");
    group.className = "settings-control-stack";
    const summary = document.createElement("p");
    summary.className = "settings-hint";
    summary.textContent = t(this.options.language, "settingsModelsSummary", {
      hidden: String(this.options.settings.hiddenModels.length),
      recent: String(this.options.settings.recentModels.length),
    });
    const manage = document.createElement("button");
    manage.type = "button";
    manage.className = "toolbar-btn";
    manage.dataset.testid = "settings-manage-models";
    manage.textContent = t(this.options.language, "chatManageModels");
    manage.onclick = () => this.options.onManageModels();
    group.append(summary, manage);

    this.contentEl.appendChild(
      this.row(
        t(this.options.language, "chatModelsTitle"),
        t(this.options.language, "chatModelsHint"),
        group,
      ),
    );
  }

  private row(
    label: string,
    description: string,
    control: HTMLElement,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "settings-row";
    const text = document.createElement("div");
    text.className = "settings-row-text";
    const labelEl = document.createElement("div");
    labelEl.className = "settings-row-label";
    labelEl.textContent = label;
    const descriptionEl = document.createElement("div");
    descriptionEl.className = "settings-row-description";
    descriptionEl.textContent = description;
    text.append(labelEl, descriptionEl);
    row.append(text, control);
    return row;
  }

  private selectControl(
    testId: string,
    options: Array<{ value: string; label: string }>,
    value: string,
    onChange: (value: string) => void,
  ): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "settings-select";
    select.dataset.testid = testId;
    for (const option of options) {
      const optionEl = document.createElement("option");
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    }
    select.value = value;
    select.onchange = () => onChange(select.value);
    return select;
  }

  private switchControl(
    testId: string,
    checked: boolean,
    onChange: (checked: boolean) => void,
    labelText: string,
  ): HTMLElement {
    const label = document.createElement("label");
    label.className = "settings-switch";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.dataset.testid = testId;
    input.setAttribute("aria-label", labelText);
    input.checked = checked;
    input.onchange = () => onChange(input.checked);
    const track = document.createElement("span");
    track.className = "settings-switch-track";
    label.append(input, track);
    return label;
  }

  private emptyMessage(message: string): HTMLElement {
    const empty = document.createElement("div");
    empty.className = "settings-empty";
    empty.textContent = message;
    return empty;
  }
}
