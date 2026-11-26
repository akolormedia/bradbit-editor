import { t } from "../i18n";
import { Language } from "../types";
import { createIcon } from "../ui/icons";
import { normalizeGeneratedRegex } from "./searchQuery";

export interface SearchBarQuery {
  search: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}

export interface SearchBarHandlers {
  onSearchChange: (query: SearchBarQuery) => void;
  onFindNext: () => void;
  onFindPrevious: () => void;
  onReplace: (replace: string) => void;
  onReplaceAll: (replace: string) => void;
  onClose: () => void;
  onGenerateRegex: (description: string) => Promise<string>;
  onOpenSettings: () => void;
}

/**
 * Compact find/replace toolbar shared by the buffer and project search.
 * It owns only its controls; the caller decides whether the query runs inside
 * CodeMirror or against the project index.
 */
export class SearchBar {
  private readonly root: HTMLElement;
  private readonly queryInput: HTMLInputElement;
  private readonly replaceRow: HTMLElement;
  private readonly replaceInput: HTMLInputElement;
  private readonly replaceToggle: HTMLButtonElement;
  private readonly countEl: HTMLElement;
  private readonly errorEl: HTMLElement;
  private readonly aiPopover: HTMLElement;
  private readonly aiPrompt: HTMLTextAreaElement;
  private readonly aiError: HTMLElement;
  private readonly aiStatus: HTMLElement;
  private readonly aiGenerate: HTMLButtonElement;
  private readonly optionButtons = new Map<keyof SearchBarQuery, HTMLButtonElement>();
  private query: SearchBarQuery = {
    search: "",
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
  };
  private replaceOpen = false;
  private aiOpen = false;
  private generating = false;
  private generation = 0;

  constructor(
    private readonly language: Language,
    private readonly handlers: SearchBarHandlers,
  ) {
    this.root = document.createElement("div");
    this.root.className = "editor-search-bar";
    this.root.dataset.testid = "editor-search-bar";

    const queryRow = document.createElement("div");
    queryRow.className = "search-query-row";

    const field = document.createElement("div");
    field.className = "search-query-field";
    this.queryInput = document.createElement("input");
    this.queryInput.className = "search-query-input";
    this.queryInput.type = "text";
    this.queryInput.dataset.testid = "search-query-input";
    this.queryInput.placeholder = t(language, "searchPlaceholder");
    this.queryInput.spellcheck = false;
    this.queryInput.autocomplete = "off";
    this.queryInput.autocapitalize = "off";
    this.queryInput.oninput = () => {
      this.query.search = this.queryInput.value;
      this.emitChange();
    };
    this.queryInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.shiftKey) this.handlers.onFindPrevious();
        else this.handlers.onFindNext();
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        if (this.aiOpen) this.closeAi();
        else this.handlers.onClose();
      }
    };

    const toggles = document.createElement("div");
    toggles.className = "search-toggles";
    this.optionButtons.set(
      "caseSensitive",
      this.toggleButton("Aa", "searchCaseSensitive", "caseSensitive"),
    );
    this.optionButtons.set(
      "wholeWord",
      this.toggleButton("wd", "searchWholeWord", "wholeWord"),
    );
    this.optionButtons.set(
      "regexp",
      this.toggleButton(".*", "searchRegex", "regexp"),
    );

    const aiButton = this.iconButton(
      "sparkles",
      t(language, "searchAiRegex"),
      () => this.openAi(),
      "search-ai-btn",
      "search-ai-btn",
    );

    toggles.append(
      this.optionButtons.get("caseSensitive")!,
      this.optionButtons.get("wholeWord")!,
      this.optionButtons.get("regexp")!,
      aiButton,
    );
    field.append(this.queryInput, toggles);

    this.replaceToggle = this.iconButton(
      "replace",
      t(language, "searchReplaceToggle"),
      () => this.setReplaceOpen(!this.replaceOpen),
      "search-icon-btn",
      "search-replace-toggle",
    );
    this.replaceToggle.setAttribute("aria-pressed", "false");

    const nav = document.createElement("div");
    nav.className = "search-nav";
    nav.append(
      this.iconButton(
        "chevron-left",
        t(language, "searchPrevious"),
        () => this.handlers.onFindPrevious(),
        "search-icon-btn",
        "search-previous",
      ),
      this.iconButton(
        "chevron-right",
        t(language, "searchNext"),
        () => this.handlers.onFindNext(),
        "search-icon-btn",
        "search-next",
      ),
    );
    this.countEl = document.createElement("span");
    this.countEl.className = "search-count";
    this.countEl.dataset.testid = "search-count";
    this.countEl.textContent = "0/0";
    nav.appendChild(this.countEl);

    const close = this.iconButton(
      "x",
      t(language, "searchClose"),
      () => this.handlers.onClose(),
      "search-icon-btn",
      "search-close",
    );

    queryRow.append(field, this.replaceToggle, nav, close);
    this.root.appendChild(queryRow);

    this.errorEl = document.createElement("div");
    this.errorEl.className = "search-bar-error";
    this.errorEl.hidden = true;
    this.root.appendChild(this.errorEl);

    this.replaceRow = document.createElement("div");
    this.replaceRow.className = "search-replace-row";
    this.replaceRow.hidden = true;
    this.replaceInput = document.createElement("input");
    this.replaceInput.className = "search-replace-input";
    this.replaceInput.type = "text";
    this.replaceInput.placeholder = t(language, "searchReplace");
    this.replaceInput.dataset.testid = "search-replace-input";
    this.replaceInput.spellcheck = false;
    this.replaceInput.autocomplete = "off";
    this.replaceInput.autocapitalize = "off";
    this.replaceInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (event.metaKey) this.handlers.onReplaceAll(this.replaceInput.value);
        else this.handlers.onReplace(this.replaceInput.value);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.setReplaceOpen(false);
        this.focus();
      }
    };
    const replace = document.createElement("button");
    replace.type = "button";
    replace.className = "search-action-btn";
    replace.dataset.testid = "search-replace";
    replace.textContent = t(language, "searchReplace");
    replace.onclick = () => this.handlers.onReplace(this.replaceInput.value);
    const replaceAll = document.createElement("button");
    replaceAll.type = "button";
    replaceAll.className = "search-action-btn";
    replaceAll.dataset.testid = "search-replace-all";
    replaceAll.textContent = t(language, "searchReplaceAll");
    replaceAll.onclick = () =>
      this.handlers.onReplaceAll(this.replaceInput.value);
    this.replaceRow.append(this.replaceInput, replace, replaceAll);
    this.root.appendChild(this.replaceRow);

    this.aiPopover = document.createElement("div");
    this.aiPopover.className = "search-ai-popover";
    this.aiPopover.hidden = true;
    this.aiPopover.dataset.testid = "search-ai-popover";
    const aiTitle = document.createElement("div");
    aiTitle.className = "search-ai-title";
    aiTitle.textContent = t(language, "searchAiPromptTitle");
    this.aiPrompt = document.createElement("textarea");
    this.aiPrompt.className = "search-ai-input";
    this.aiPrompt.rows = 2;
    this.aiPrompt.placeholder = t(language, "searchAiPromptPlaceholder");
    this.aiPrompt.dataset.testid = "search-ai-input";
    this.aiPrompt.onkeydown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeAi();
      }
    };
    this.aiError = document.createElement("div");
    this.aiError.className = "search-ai-error";
    this.aiError.hidden = true;
    this.aiStatus = document.createElement("div");
    this.aiStatus.className = "search-ai-status";
    this.aiStatus.dataset.testid = "search-ai-status";
    this.aiStatus.hidden = true;
    this.aiStatus.setAttribute("aria-live", "polite");
    const spinner = document.createElement("span");
    spinner.className = "search-ai-spinner";
    spinner.appendChild(createIcon("refresh-cw", 12));
    const statusText = document.createElement("span");
    statusText.textContent = t(language, "searchAiThinking");
    this.aiStatus.append(spinner, statusText);

    const aiSettings = document.createElement("button");
    aiSettings.type = "button";
    aiSettings.className = "search-ai-settings";
    aiSettings.dataset.testid = "search-ai-settings";
    aiSettings.title = t(language, "searchAiSettingsTitle");
    aiSettings.setAttribute("aria-label", aiSettings.title);
    aiSettings.append(createIcon("settings", 13));
    const settingsText = document.createElement("span");
    settingsText.textContent = t(language, "searchAiSettings");
    aiSettings.appendChild(settingsText);
    aiSettings.onclick = () => {
      this.closeAi();
      this.handlers.onOpenSettings();
    };

    const aiButtons = document.createElement("div");
    aiButtons.className = "search-ai-buttons";
    const aiActions = document.createElement("div");
    aiActions.className = "search-ai-actions";
    this.aiGenerate = document.createElement("button");
    this.aiGenerate.type = "button";
    this.aiGenerate.className = "search-action-btn primary";
    this.aiGenerate.dataset.testid = "search-ai-generate";
    this.aiGenerate.textContent = t(language, "searchAiGenerate");
    this.aiGenerate.onclick = () => void this.generateRegex();
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "search-action-btn";
    cancel.textContent = t(language, "cancel");
    cancel.onclick = () => this.closeAi();
    aiButtons.append(this.aiGenerate, cancel);
    aiActions.append(aiSettings, aiButtons);
    this.aiPopover.append(
      aiTitle,
      this.aiPrompt,
      this.aiError,
      this.aiStatus,
      aiActions,
    );
    this.root.appendChild(this.aiPopover);
  }

  public element(): HTMLElement {
    return this.root;
  }

  public getQuery(): SearchBarQuery {
    return { ...this.query };
  }

  public setQuery(
    value: string,
    options?: Partial<SearchBarQuery>,
    notify = true,
  ): void {
    this.query = { ...this.query, ...options, search: value };
    this.queryInput.value = value;
    this.updateOptionButtons();
    if (notify) this.emitChange();
  }

  public setMatchInfo(current: number, total: number): void {
    const index = total > 0 ? Math.max(1, current) : 0;
    this.countEl.textContent = `${index}/${total}`;
  }

  public setError(message: string): void {
    this.errorEl.textContent = message;
    this.errorEl.hidden = message.length === 0;
  }

  public setReplaceOpen(open: boolean): void {
    this.replaceOpen = open;
    this.replaceRow.hidden = !open;
    this.replaceToggle.setAttribute("aria-pressed", String(open));
    this.replaceToggle.classList.toggle("active", open);
    if (open) {
      this.replaceInput.focus();
      this.replaceInput.select();
    }
  }

  public focus(): void {
    this.queryInput.focus();
    this.queryInput.select();
  }

  public focusReplace(): void {
    if (!this.replaceOpen) this.setReplaceOpen(true);
    this.replaceInput.focus();
    this.replaceInput.select();
  }

  private emitChange(): void {
    this.handlers.onSearchChange(this.getQuery());
  }

  private toggleButton(
    label: string,
    titleKey: Parameters<typeof t>[1],
    key: keyof SearchBarQuery,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-option";
    button.textContent = label;
    button.title = t(this.language, titleKey);
    button.setAttribute("aria-label", button.title);
    button.setAttribute("aria-pressed", "false");
    button.dataset.searchOption = key;
    button.onclick = () => {
      this.query = { ...this.query, [key]: !this.query[key] };
      this.updateOptionButtons();
      this.emitChange();
      this.focus();
    };
    return button;
  }

  private updateOptionButtons(): void {
    for (const [key, button] of this.optionButtons) {
      const active = Boolean(this.query[key]);
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  }

  private iconButton(
    icon: Parameters<typeof createIcon>[0],
    label: string,
    onClick: () => void,
    className: string,
    testId: string,
  ): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.dataset.testid = testId;
    button.title = label;
    button.setAttribute("aria-label", label);
    button.appendChild(createIcon(icon, 14));
    button.onclick = onClick;
    return button;
  }

  private openAi(): void {
    this.aiOpen = true;
    this.aiPopover.hidden = false;
    this.aiError.hidden = true;
    this.aiStatus.hidden = true;
    this.aiPrompt.disabled = false;
    this.aiPrompt.focus();
  }

  private closeAi(): void {
    this.aiOpen = false;
    this.aiPopover.hidden = true;
    this.aiError.hidden = true;
    this.aiStatus.hidden = true;
    if (this.generating) {
      this.generation += 1;
      this.generating = false;
      this.aiGenerate.disabled = false;
      this.aiGenerate.textContent = t(this.language, "searchAiGenerate");
      this.aiPrompt.disabled = false;
    }
    this.focus();
  }

  private async generateRegex(): Promise<void> {
    if (this.generating) return;
    const description = this.aiPrompt.value.trim();
    if (!description) {
      this.aiError.textContent = t(this.language, "searchAiEmpty");
      this.aiError.hidden = false;
      return;
    }
    this.generating = true;
    const generation = ++this.generation;
    this.aiGenerate.disabled = true;
    this.aiGenerate.textContent = t(this.language, "searchAiGenerating");
    this.aiPrompt.disabled = true;
    this.aiError.hidden = true;
    this.aiStatus.hidden = false;
    try {
      const raw = await this.handlers.onGenerateRegex(description);
      if (generation !== this.generation) return;
      const regex = normalizeGeneratedRegex(raw);
      if (!regex) {
        throw new Error(t(this.language, "searchAiEmptyAnswer"));
      }
      this.aiOpen = false;
      this.aiPopover.hidden = true;
      this.setQuery(regex, { regexp: true });
      this.focus();
    } catch (err) {
      if (generation !== this.generation) return;
      this.aiStatus.hidden = true;
      this.aiError.textContent =
        err instanceof Error
          ? err.message
          : t(this.language, "searchAiError");
      this.aiError.hidden = false;
    } finally {
      if (generation === this.generation) {
        this.generating = false;
        this.aiGenerate.disabled = false;
        this.aiGenerate.textContent = t(this.language, "searchAiGenerate");
        this.aiPrompt.disabled = false;
        this.aiStatus.hidden = true;
      }
    }
  }
}
