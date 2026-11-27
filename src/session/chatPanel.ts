import { backend } from "../backend";
import { t } from "../i18n";
import { KitCatalog, Language, OpenCodeFormField, OpenCodeModel } from "../types";
import { createIcon, IconName } from "../ui/icons";
import { renderMarkdownPreview } from "../editor/preview";
import { classifyFountainLines } from "../editor/fountainPreview";
import { createIconButton } from "../ui/iconButton";
import { kitCommandCandidates, localizedKitText } from "../kit/localize";
import { QuickOpenFile } from "../workspace/quickOpen";
import {
  ChatForm,
  ChatPermission,
  ChatState,
  ChatToolCall,
  initialChatState,
  messageText,
} from "./chatState";
import { SessionTabInfo } from "./sessionTabs";
import { projectRelativePath } from "./chatPaths";
import {
  questionPrompts,
  renderAnsweredForm,
  renderQuestionTool,
} from "./questionCards";
import {
  activeCompletion,
  CompletionToken,
  filterCommands,
  filterProjectFiles,
  replaceCompletion,
} from "./composer";

function setCheckIcon(element: HTMLElement, active: boolean): void {
  element.replaceChildren();
  if (active) element.appendChild(createIcon("check", 13));
}

export interface ChatPanelOptions {
  variant?: "session" | "welcome";
  language: Language;
  projectName: string;
  projectRoot: string;
  sessions: SessionTabInfo[];
  activeSessionId: string | null;
  canCreateSession: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onRenameSession: (id: string, title: string) => void;
  onOpenToolFile: (path: string, showDiff: boolean) => void;
  onPermissionReply: (
    requestId: string,
    decision: "once" | "always" | "reject",
  ) => void;
  onFormReply: (formId: string, answer: Record<string, unknown>) => void;
  kit: KitCatalog;
  models: OpenCodeModel[];
  projectFiles: QuickOpenFile[];
  hiddenModels: string[];
  recentModels: string[];
  onAgentChange: (agent: string | null) => void;
  onModelChange: (
    providerId: string,
    modelId: string,
    variant?: string,
  ) => void;
  onManageModels: () => void;
}

function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

/**
 * Left-hand writing session: session tab, status header, streaming messages
 * and the composer. The editor lives outside this component and keeps its
 * CodeMirror state when the panel is hidden or resized.
 */
export class ChatPanel {
  public readonly element: HTMLElement;
  private options: ChatPanelOptions;
  private state: ChatState = initialChatState;
  private messagesEl: HTMLElement;
  private requestsEl: HTMLElement;
  private composer: HTMLTextAreaElement;
  private plusBtn: HTMLButtonElement;
  private modelBtn: HTMLButtonElement;
  private modelProviderEl: HTMLElement;
  private modelSlashEl: HTMLElement;
  private modelNameEl: HTMLElement;
  private effortBtn: HTMLButtonElement;
  private effortLabelEl: HTMLElement;
  private modelPopover: HTMLElement;
  private modelListEl: HTMLElement;
  private modelSearch: HTMLInputElement;
  private effortPopover: HTMLElement;
  private plusPopover: HTMLElement;
  private popoverEl: HTMLElement;
  private popoverToken: CompletionToken | null = null;
  private popoverItems: Array<{
    value: string;
    label: string;
    description: string;
  }> = [];
  private popoverIndex = 0;
  private popoverMode: "command" | "mention" | null = null;
  private sendBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private errorEl: HTMLElement;
  private errorText: HTMLElement;
  private errorSettingsBtn: HTMLButtonElement;
  private statusEl: HTMLElement;
  private statusDot: HTMLElement;
  private contextEl: HTMLElement;
  private tabsEl: HTMLElement;
  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private forceScrollToBottom = false;
  private lastRenderStructure = "";
  private textBubbles = new Map<string, HTMLElement>();
  private renderedTexts = new Map<string, string>();
  private lastTabClick = { id: null as string | null, time: 0 };
  private drafts = new Map<string, string>();
  private draftSessionId: string | null = null;
  private formDrafts = new Map<string, Record<string, unknown>>();

  constructor(options: ChatPanelOptions) {
    this.options = options;
    this.draftSessionId = options.activeSessionId;
    this.element = document.createElement("div");
    this.element.className = "chat-panel";
    if (options.variant === "welcome") {
      this.element.classList.add("chat-panel-welcome");
    }
    this.element.dataset.testid = "chat-panel";

    this.tabsEl = document.createElement("div");
    this.tabsEl.className = "session-tabs";
    this.element.dataset.testid = "chat-panel";

    const header = document.createElement("div");
    header.className = "session-header";
    const heading = document.createElement("div");
    heading.className = "session-heading";
    this.titleEl = document.createElement("div");
    this.titleEl.className = "session-title";
    this.subtitleEl = document.createElement("div");
    this.subtitleEl.className = "session-subtitle";
    this.statusDot = document.createElement("span");
    this.statusDot.className = "session-status-dot";
    this.statusEl = document.createElement("span");
    this.statusEl.className = "session-status";
    this.subtitleEl.append(this.statusDot, this.statusEl);
    heading.append(this.titleEl, this.subtitleEl);

    const actions = document.createElement("div");
    actions.className = "session-header-actions";
    this.contextEl = document.createElement("span");
    this.contextEl.className = "session-context";
    actions.append(this.contextEl);
    header.append(heading, actions);

    this.errorEl = document.createElement("div");
    this.errorEl.className = "chat-error-banner";
    this.errorText = document.createElement("span");
    const retry = document.createElement("button");
    retry.className = "chat-retry-btn";
    retry.dataset.testid = "chat-retry";
    retry.textContent = t(options.language, "chatRetry");
    retry.onclick = () => this.options.onRetry();
    this.errorSettingsBtn = document.createElement("button");
    this.errorSettingsBtn.className = "chat-retry-btn";
    this.errorSettingsBtn.dataset.testid = "chat-error-settings";
    this.errorSettingsBtn.textContent = t(
      options.language,
      "chatErrorConfigureModels",
    );
    this.errorSettingsBtn.onclick = () => this.options.onOpenSettings();
    this.errorSettingsBtn.hidden = true;
    this.errorEl.append(this.errorText, this.errorSettingsBtn, retry);
    this.errorEl.hidden = true;

    this.messagesEl = document.createElement("div");
    this.messagesEl.className = "chat-messages";

    this.requestsEl = document.createElement("div");
    this.requestsEl.className = "chat-requests";
    this.requestsEl.hidden = true;

    const composer = document.createElement("div");
    composer.className = "chat-composer";

    this.composer = document.createElement("textarea");
    this.composer.className = "chat-input";
    this.composer.dataset.testid = "chat-input";
    this.composer.rows = 3;
    this.composer.oninput = () => {
      this.saveDraft();
      this.refreshPopover();
      this.updateSendState();
    };
    this.composer.onclick = () => this.refreshPopover();
    this.composer.onkeydown = (event) => {
      if (this.popoverMode && this.popoverItems.length > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          this.movePopover(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          this.movePopover(-1);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          this.selectPopoverItem();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          this.hidePopover();
          return;
        }
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.submit();
      }
    };

    const bar = document.createElement("div");
    bar.className = "chat-composer-bar";

    this.plusBtn = createIconButton({
      icon: "plus",
      label: t(options.language, "chatMoreActions"),
      className: "chat-plus-btn",
      testId: "chat-plus",
      plain: true,
      onClick: () => this.togglePlusPopover(),
    });

    this.modelBtn = document.createElement("button");
    this.modelBtn.type = "button";
    this.modelBtn.className = "chat-model-btn";
    this.modelBtn.dataset.testid = "chat-model-button";
    this.modelBtn.title = t(options.language, "chatModelLabel");
    this.modelBtn.setAttribute(
      "aria-label",
      t(options.language, "chatModelLabel"),
    );
    this.modelProviderEl = document.createElement("span");
    this.modelProviderEl.className = "chat-model-provider";
    this.modelSlashEl = document.createElement("span");
    this.modelSlashEl.className = "chat-model-slash";
    this.modelSlashEl.textContent = "/";
    this.modelNameEl = document.createElement("span");
    this.modelNameEl.className = "chat-model-name";
    const modelChevron = document.createElement("span");
    modelChevron.className = "chat-model-chevron";
    modelChevron.appendChild(createIcon("chevron-down", 12));
    this.modelBtn.append(
      this.modelProviderEl,
      this.modelSlashEl,
      this.modelNameEl,
      modelChevron,
    );
    this.modelBtn.onclick = () => this.toggleModelPopover();

    this.effortBtn = document.createElement("button");
    this.effortBtn.type = "button";
    this.effortBtn.className = "chat-effort-btn";
    this.effortBtn.dataset.testid = "chat-effort-button";
    this.effortBtn.title = t(options.language, "chatEffortLabel");
    this.effortBtn.setAttribute(
      "aria-label",
      t(options.language, "chatEffortLabel"),
    );
    this.effortLabelEl = document.createElement("span");
    this.effortLabelEl.className = "chat-effort-label";
    const effortChevron = document.createElement("span");
    effortChevron.className = "chat-model-chevron";
    effortChevron.appendChild(createIcon("chevron-down", 12));
    this.effortBtn.append(this.effortLabelEl, effortChevron);
    this.effortBtn.onclick = () => this.toggleEffortPopover();

    const spacer = document.createElement("span");
    spacer.className = "chat-composer-spacer";

    this.sendBtn = createIconButton({
      icon: "arrow-up",
      label: t(options.language, "chatSend"),
      className: "chat-send-arrow",
      testId: "chat-send",
      plain: true,
      onClick: () => this.submit(),
    });

    this.stopBtn = createIconButton({
      icon: "square",
      label: t(options.language, "chatStop"),
      className: "chat-stop-square",
      testId: "chat-stop",
      plain: true,
      onClick: () => this.options.onStop(),
    });
    this.stopBtn.hidden = true;

    bar.append(
      this.plusBtn,
      this.modelBtn,
      this.effortBtn,
      spacer,
      this.sendBtn,
      this.stopBtn,
    );

    this.popoverEl = document.createElement("div");
    this.popoverEl.className = "chat-composer-popover";
    this.popoverEl.hidden = true;
    this.popoverEl.setAttribute("role", "listbox");

    this.modelPopover = document.createElement("div");
    this.modelPopover.className = "chat-model-popover";
    this.modelPopover.hidden = true;
    const modelHeader = document.createElement("div");
    modelHeader.className = "chat-model-popover-header";
    const searchIcon = document.createElement("span");
    searchIcon.className = "chat-model-search-icon";
    searchIcon.appendChild(createIcon("search", 14));
    this.modelSearch = document.createElement("input");
    this.modelSearch.type = "text";
    this.modelSearch.className = "chat-model-search";
    this.modelSearch.dataset.testid = "chat-model-search";
    this.modelSearch.placeholder = t(options.language, "chatSearchModels");
    this.modelSearch.oninput = () => this.renderModelList();
    const manageBtn = createIconButton({
      icon: "sliders-horizontal",
      label: t(options.language, "chatManageModels"),
      className: "chat-model-manage",
      testId: "chat-manage-models",
      plain: true,
      onClick: () => {
        this.hideMenus();
        this.options.onManageModels();
      },
    });
    modelHeader.append(searchIcon, this.modelSearch, manageBtn);
    this.modelListEl = document.createElement("div");
    this.modelListEl.className = "chat-model-list";
    this.modelPopover.append(modelHeader, this.modelListEl);

    this.effortPopover = document.createElement("div");
    this.effortPopover.className = "chat-effort-popover";
    this.effortPopover.hidden = true;

    this.plusPopover = document.createElement("div");
    this.plusPopover.className = "chat-plus-popover";
    this.plusPopover.hidden = true;

    composer.append(
      this.composer,
      bar,
      this.popoverEl,
      this.modelPopover,
      this.effortPopover,
      this.plusPopover,
    );

    this.element.addEventListener("mousedown", (event) => {
      const target = event.target as HTMLElement;
      if (
        target.closest(
          ".chat-composer-popover, .chat-model-popover, .chat-effort-popover, .chat-plus-popover, .chat-model-btn, .chat-effort-btn, .chat-plus-btn",
        )
      ) {
        return;
      }
      this.hideMenus();
    });

    this.element.append(
      this.tabsEl,
      header,
      this.errorEl,
      this.messagesEl,
      composer,
    );
    this.update(initialChatState, options);
  }

  public update(state: ChatState, options?: Partial<ChatPanelOptions>): void {
    const previousActive = this.options.activeSessionId;
    if (options) {
      this.options = { ...this.options, ...options };
    }
    if (previousActive !== this.options.activeSessionId) {
      this.forceScrollToBottom = true;
    }
    this.state = state;
    const lang = this.options.language;

    const nextActive = this.options.activeSessionId;
    if (this.draftSessionId !== nextActive) {
      if (this.draftSessionId) {
        this.drafts.set(this.draftSessionId, this.composer.value);
      }
      this.draftSessionId = nextActive;
      this.composer.value = nextActive
        ? this.drafts.get(nextActive) ?? ""
        : "";
      this.hideMenus();
    }
    const sessionIds = new Set(this.options.sessions.map((session) => session.id));
    for (const id of [...this.drafts.keys()]) {
      if (!sessionIds.has(id)) this.drafts.delete(id);
    }

    this.updateComposerControls();
    if (!this.modelPopover.hidden) {
      this.renderModelList();
    }

    const welcome = this.options.variant === "welcome";
    this.titleEl.textContent = t(
      lang,
      welcome ? "welcomeChatTitle" : "chatHeaderTitle",
    );
    this.composer.placeholder = t(
      lang,
      welcome ? "welcomeChatPlaceholder" : "chatComposerPlaceholder",
    );
    this.renderTabs();

    const status = this.statusText(state);
    this.statusEl.textContent = status.text;
    this.statusEl.className = `session-status ${status.className}`;
    this.statusDot.className = `session-status-dot ${status.className}`;
    this.subtitleEl.title = this.options.projectName;

    if (state.tokens) {
      const context = state.tokens.input + state.tokens.cacheRead;
      this.contextEl.textContent = `${formatTokens(context)} ${t(
        lang,
        "chatContext",
      )}`;
      this.contextEl.title = t(lang, "chatContextDetail", {
        input: formatTokens(state.tokens.input),
        output: formatTokens(state.tokens.output),
        reasoning: formatTokens(state.tokens.reasoning),
        cache: formatTokens(state.tokens.cacheRead),
      });
      this.contextEl.hidden = false;
    } else {
      this.contextEl.hidden = true;
    }

    if (state.error) {
      this.errorText.textContent = `${t(lang, "chatErrorTitle")}: ${state.error}`;
      this.errorSettingsBtn.hidden = state.errorAction !== "models";
      this.errorEl.hidden = false;
    } else {
      this.errorEl.hidden = true;
      this.errorSettingsBtn.hidden = true;
    }

    this.renderMessages();
    this.updateSendState();
  }

  public clearDraft(): void {
    this.hideMenus();
    this.composer.value = "";
    if (this.draftSessionId) {
      this.drafts.delete(this.draftSessionId);
    }
    this.updateSendState();
    this.composer.focus();
  }

  public focus(): void {
    this.composer.focus();
  }

  public appendDraft(text: string): void {
    const addition = text.trim();
    if (!addition) return;
    const current = this.composer.value.trimEnd();
    this.composer.value = current ? `${current}\n\n${addition}` : addition;
    this.saveDraft();
    this.updateSendState();
    this.hideMenus();
    this.composer.focus();
    this.composer.setSelectionRange(
      this.composer.value.length,
      this.composer.value.length,
    );
  }

  private saveDraft(): void {
    if (this.draftSessionId) {
      this.drafts.set(this.draftSessionId, this.composer.value);
    }
  }

  private providerLabel(providerId: string): string {
    if (!providerId) return "";
    if (providerId === "opencode-go") return "OpenCode Go";
    if (providerId === "opencode") return "OpenCode";
    if (providerId === "openai") return "OpenAI";
    return providerId
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private capitalize(value: string): string {
    return value.length > 0
      ? `${value.charAt(0).toUpperCase()}${value.slice(1)}`
      : value;
  }

  private modelKey(model: OpenCodeModel): string {
    return `${model.providerId}/${model.id}`;
  }

  private currentModel(): {
    model: OpenCodeModel | null;
    providerId: string;
    modelId: string;
    variant: string;
  } {
    const raw = this.state.model;
    if (!raw) {
      return { model: null, providerId: "", modelId: "", variant: "" };
    }
    const hash = raw.indexOf("#");
    const base = hash >= 0 ? raw.slice(0, hash) : raw;
    const variant = hash >= 0 ? raw.slice(hash + 1) : "";
    const slash = base.indexOf("/");
    const providerId = slash >= 0 ? base.slice(0, slash) : "";
    const modelId = slash >= 0 ? base.slice(slash + 1) : base;
    const model =
      this.options.models.find(
        (candidate) =>
          candidate.providerId === providerId && candidate.id === modelId,
      ) ?? null;
    return { model, providerId, modelId, variant };
  }

  private updateComposerControls(): void {
    const current = this.currentModel();
    if (!this.state.model) {
      this.modelProviderEl.textContent = "";
      this.modelSlashEl.hidden = true;
      this.modelNameEl.textContent = t(
        this.options.language,
        "chatModelButtonDefault",
      );
    } else {
      this.modelProviderEl.textContent = this.providerLabel(
        current.providerId,
      );
      this.modelSlashEl.hidden = false;
      this.modelNameEl.textContent = current.model?.name ?? current.modelId;
    }
    this.effortLabelEl.textContent = current.variant
      ? this.capitalize(current.variant)
      : t(this.options.language, "chatEffortDefault");
    this.modelBtn.title = this.state.model
      ? `${this.providerLabel(current.providerId)} / ${current.model?.name ?? current.modelId}`
      : t(this.options.language, "chatModelLabel");
    this.effortBtn.title = t(this.options.language, "chatEffortLabel");
  }

  private hideMenus(): void {
    this.hidePopover();
    this.modelPopover.hidden = true;
    this.effortPopover.hidden = true;
    this.plusPopover.hidden = true;
  }

  private toggleModelPopover(): void {
    if (!this.modelPopover.hidden) {
      this.modelPopover.hidden = true;
      return;
    }
    this.hideMenus();
    this.modelSearch.value = "";
    this.renderModelList();
    this.modelPopover.hidden = false;
    this.modelSearch.focus();
  }

  private toggleEffortPopover(): void {
    if (!this.effortPopover.hidden) {
      this.effortPopover.hidden = true;
      return;
    }
    this.hideMenus();
    this.renderEffortOptions();
    this.effortPopover.hidden = false;
  }

  private togglePlusPopover(): void {
    if (!this.plusPopover.hidden) {
      this.plusPopover.hidden = true;
      return;
    }
    this.hideMenus();
    this.renderPlusPopover();
    this.plusPopover.hidden = false;
  }

  private renderModelList(): void {
    const lang = this.options.language;
    const hidden = new Set(this.options.hiddenModels);
    const query = this.modelSearch.value.trim().toLowerCase();
    const visible = this.options.models.filter((model) => {
      if (hidden.has(this.modelKey(model))) return false;
      if (!query) return true;
      return `${model.name} ${model.providerId} ${model.id}`
        .toLowerCase()
        .includes(query);
    });
    const current = this.currentModel();
    const currentKey = this.state.model
      ? `${current.providerId}/${current.modelId}`
      : "";
    this.modelListEl.innerHTML = "";

    const addSection = (label: string) => {
      const section = document.createElement("div");
      section.className = "chat-model-section";
      section.textContent = label;
      this.modelListEl.appendChild(section);
    };

    const addRow = (model: OpenCodeModel, showProvider: boolean) => {
      const key = this.modelKey(model);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-model-row";
      button.dataset.testid = `chat-model-row-${model.providerId}-${model.id}`;
      const check = document.createElement("span");
      check.className = "chat-model-check";
      setCheckIcon(check, key === currentKey);
      const name = document.createElement("span");
      name.className = "chat-model-row-name";
      name.textContent = model.name;
      button.append(check, name);
      if (showProvider) {
        const provider = document.createElement("span");
        provider.className = "chat-model-row-provider";
        provider.textContent = this.providerLabel(model.providerId);
        button.appendChild(provider);
      }
      if (
        key === currentKey &&
        current.variant &&
        this.options.models.some((candidate) => this.modelKey(candidate) === key)
      ) {
        const effort = document.createElement("span");
        effort.className = "chat-model-row-effort";
        effort.textContent = this.capitalize(current.variant);
        button.appendChild(effort);
      }
      button.onclick = () => {
        this.options.onModelChange(
          model.providerId,
          model.id,
          key === currentKey && current.variant
            ? current.variant
            : undefined,
        );
        this.modelPopover.hidden = true;
      };
      this.modelListEl.appendChild(button);
    };

    if (!query && this.options.recentModels.length > 0) {
      const recents = this.options.recentModels
        .map((key) =>
          visible.find((model) => this.modelKey(model) === key),
        )
        .filter((model): model is OpenCodeModel => Boolean(model))
        .slice(0, 5);
      if (recents.length > 0) {
        addSection(t(lang, "chatRecentModels"));
        for (const model of recents) addRow(model, true);
      }
    }

    const byProvider = new Map<string, OpenCodeModel[]>();
    for (const model of visible) {
      const models = byProvider.get(model.providerId) ?? [];
      models.push(model);
      byProvider.set(model.providerId, models);
    }
    const currentProvider = current.providerId || "opencode-go";
    const providers = [...byProvider.keys()].sort((a, b) => {
      if (a === currentProvider) return -1;
      if (b === currentProvider) return 1;
      if (a === "opencode-go") return -1;
      if (b === "opencode-go") return 1;
      return a.localeCompare(b);
    });
    for (const provider of providers) {
      addSection(this.providerLabel(provider));
      for (const model of byProvider.get(provider)!.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        addRow(model, false);
      }
    }
    if (visible.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-model-empty";
      empty.textContent = t(lang, "chatNoModels");
      this.modelListEl.appendChild(empty);
    }
  }

  private renderEffortOptions(): void {
    const lang = this.options.language;
    const current = this.currentModel();
    this.effortPopover.innerHTML = "";
    if (!current.model) {
      const empty = document.createElement("div");
      empty.className = "chat-model-empty";
      empty.textContent = t(lang, "chatModelButtonDefault");
      this.effortPopover.appendChild(empty);
      return;
    }
    const add = (value: string, label: string) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-model-row";
      button.dataset.testid = `chat-effort-row-${value || "default"}`;
      const check = document.createElement("span");
      check.className = "chat-model-check";
      setCheckIcon(check, current.variant === value);
      const name = document.createElement("span");
      name.className = "chat-model-row-name";
      name.textContent = label;
      button.append(check, name);
      button.onclick = () => {
        this.options.onModelChange(
          current.providerId,
          current.modelId,
          value || undefined,
        );
        this.effortPopover.hidden = true;
      };
      this.effortPopover.appendChild(button);
    };
    add("", t(lang, "chatEffortDefault"));
    for (const variant of current.model.variants) {
      add(variant, this.capitalize(variant));
    }
  }

  private renderPlusPopover(): void {
    const lang = this.options.language;
    this.plusPopover.innerHTML = "";

    const addAction = (
      icon: IconName,
      label: string,
      testid: string,
      action: () => void,
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-plus-item";
      button.dataset.testid = testid;
      const iconEl = document.createElement("span");
      iconEl.className = "chat-plus-item-icon";
      iconEl.appendChild(createIcon(icon, 15));
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      button.append(iconEl, labelEl);
      button.onclick = action;
      this.plusPopover.appendChild(button);
    };

    addAction("file-plus", t(lang, "chatPlusFile"), "composer-plus-file", () => {
      this.hideMenus();
      this.openMentionAtCursor();
    });
    addAction("slash", t(lang, "chatPlusCommand"), "composer-plus-command", () => {
      this.hideMenus();
      this.insertSlashCommand();
    });

    const divider = document.createElement("div");
    divider.className = "chat-plus-divider";
    this.plusPopover.appendChild(divider);
    const agentLabel = document.createElement("div");
    agentLabel.className = "chat-plus-section";
    agentLabel.textContent = t(lang, "chatPlusAgent");
    this.plusPopover.appendChild(agentLabel);

    const addAgent = (
      value: string | null,
      label: string,
      description?: string,
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-plus-item";
      button.dataset.testid = `composer-agent-${value ?? "default"}`;
      const check = document.createElement("span");
      check.className = "chat-plus-agent-check";
      const currentAgent = this.state.agent ?? "";
      const active =
        value === null
          ? currentAgent === "" || currentAgent === "build"
          : currentAgent === value;
      setCheckIcon(check, active);
      const labelEl = document.createElement("span");
      labelEl.textContent = label;
      if (description) labelEl.title = description;
      button.append(check, labelEl);
      button.onclick = () => {
        this.options.onAgentChange(value);
        this.plusPopover.hidden = true;
      };
      this.plusPopover.appendChild(button);
    };

    addAgent(null, t(lang, "chatAgentDefault"));
    for (const agent of this.options.kit.agents) {
      const localized = localizedKitText(agent, lang);
      addAgent(agent.id, localized.name, localized.description);
    }
    if (
      this.state.agent &&
      this.state.agent !== "build" &&
      !this.options.kit.agents.some((agent) => agent.id === this.state.agent)
    ) {
      addAgent(this.state.agent, this.state.agent);
    }

    const divider2 = document.createElement("div");
    divider2.className = "chat-plus-divider";
    this.plusPopover.appendChild(divider2);
    addAction("sliders-horizontal", t(lang, "chatPlusModels"), "composer-plus-manage-models", () => {
      this.hideMenus();
      this.options.onManageModels();
    });
  }

  private insertSlashCommand(): void {
    if (!this.composer.value.startsWith("/")) {
      this.composer.value = `/${this.composer.value}`;
    }
    this.saveDraft();
    this.composer.focus();
    this.composer.setSelectionRange(1, 1);
    this.refreshPopover();
  }

  private refreshPopover(): void {
    if (this.composer.disabled) {
      this.hidePopover();
      return;
    }
    const token = activeCompletion(
      this.composer.value,
      this.composer.selectionStart ?? this.composer.value.length,
    );
    if (!token) {
      this.hidePopover();
      return;
    }
    const items =
      token.kind === "command"
        ? filterCommands(
            kitCommandCandidates(this.options.kit.commands, this.options.language),
            token.query,
          ).map((command) => {
            const localized = localizedKitText(command, this.options.language);
            return {
              value: command.id,
              label: `/${localized.name}`,
              description: localized.description,
            };
          })
        : filterProjectFiles(this.options.projectFiles, token.query).map(
            (file) => ({
              value: file.path,
              label: file.path,
              description: file.name ?? "",
            }),
          );
    if (items.length === 0) {
      this.hidePopover();
      return;
    }
    this.popoverToken = token;
    this.popoverMode = token.kind;
    this.popoverItems = items;
    this.popoverIndex = 0;
    this.renderPopover();
    this.popoverEl.hidden = false;
  }

  private renderPopover(): void {
    const lang = this.options.language;
    this.popoverEl.innerHTML = "";
    const title = document.createElement("div");
    title.className = "chat-composer-popover-title";
    title.textContent =
      this.popoverMode === "command"
        ? t(lang, "chatCommandsTitle")
        : t(lang, "chatFilesTitle");
    this.popoverEl.appendChild(title);
    this.popoverItems.forEach((item, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chat-composer-option";
      button.dataset.testid = `composer-option-${index}`;
      button.dataset.active = String(index === this.popoverIndex);
      button.setAttribute("role", "option");
      button.setAttribute("aria-selected", String(index === this.popoverIndex));
      const label = document.createElement("span");
      label.className = "chat-composer-option-label";
      label.textContent = item.label;
      button.appendChild(label);
      if (item.description) {
        const description = document.createElement("span");
        description.className = "chat-composer-option-description";
        description.textContent = item.description;
        button.appendChild(description);
      }
      button.onmousedown = (event) => event.preventDefault();
      button.onclick = () => this.selectPopoverItem(index);
      this.popoverEl.appendChild(button);
    });
    const active = this.popoverEl.querySelector<HTMLElement>(
      '[data-active="true"]',
    );
    if (active) {
      const top = active.offsetTop;
      const bottom = top + active.offsetHeight;
      if (top < this.popoverEl.scrollTop) {
        this.popoverEl.scrollTop = top;
      } else if (
        bottom >
        this.popoverEl.scrollTop + this.popoverEl.clientHeight
      ) {
        this.popoverEl.scrollTop = bottom - this.popoverEl.clientHeight;
      }
    }
  }

  private movePopover(delta: number): void {
    if (this.popoverItems.length === 0) return;
    this.popoverIndex =
      (this.popoverIndex + delta + this.popoverItems.length) %
      this.popoverItems.length;
    this.renderPopover();
  }

  private selectPopoverItem(index = this.popoverIndex): void {
    const token = this.popoverToken;
    const item = this.popoverItems[index];
    if (!token || !item) return;
    const replacement =
      this.popoverMode === "command"
        ? `/${item.value} `
        : `@${item.value} `;
    const completed = replaceCompletion(
      this.composer.value,
      token,
      replacement,
    );
    this.composer.value = completed.text;
    this.saveDraft();
    this.hidePopover();
    this.updateSendState();
    this.composer.focus();
    this.composer.setSelectionRange(completed.cursor, completed.cursor);
  }

  private hidePopover(): void {
    this.popoverMode = null;
    this.popoverToken = null;
    this.popoverItems = [];
    this.popoverIndex = 0;
    if (this.popoverEl) {
      this.popoverEl.hidden = true;
      this.popoverEl.innerHTML = "";
    }
  }

  private openMentionAtCursor(): void {
    if (this.composer.disabled) return;
    this.hideMenus();
    const value = this.composer.value;
    const start = this.composer.selectionStart ?? value.length;
    const end = this.composer.selectionEnd ?? start;
    const before = value.slice(0, start);
    const needsSpace = before.length > 0 && !/\s$/.test(before);
    const insert = `${needsSpace ? " " : ""}@`;
    this.composer.value = `${before}${insert}${value.slice(end)}`;
    const cursor = start + insert.length;
    this.composer.focus();
    this.composer.setSelectionRange(cursor, cursor);
    this.saveDraft();
    this.updateSendState();
    this.refreshPopover();
  }

  private submit(): void {
    if (!this.canSend()) return;
    const text = this.composer.value.trim();
    if (!text) return;
    this.hideMenus();
    this.options.onSend(text);
  }

  private canSend(): boolean {
    return (
      this.state.status === "ready" &&
      !this.state.streaming &&
      this.composer.value.trim().length > 0
    );
  }

  private updateSendState(): void {
    this.sendBtn.disabled = !this.canSend();
    this.sendBtn.hidden = Boolean(this.state.streaming);
    this.stopBtn.hidden = !this.state.streaming;
    this.composer.disabled =
      !this.options.activeSessionId ||
      this.state.status === "starting" ||
      this.state.status === "idle";
    const ready = this.state.status === "ready" && Boolean(this.options.activeSessionId);
    this.plusBtn.disabled = !ready;
    this.modelBtn.disabled = !ready;
    this.effortBtn.disabled = !ready || !this.state.model;
    if (this.composer.disabled) {
      this.hideMenus();
    }
  }

  private statusText(state: ChatState): { text: string; className: string } {
    const lang = this.options.language;
    if (state.streaming) {
      return { text: t(lang, "chatStatusStreaming"), className: "busy" };
    }
    switch (state.status) {
      case "starting":
        return { text: t(lang, "chatStatusStarting"), className: "busy" };
      case "ready":
        return { text: t(lang, "chatStatusReady"), className: "ready" };
      case "error":
        return { text: t(lang, "chatStatusError"), className: "error" };
      default:
        return { text: t(lang, "chatStatusIdle"), className: "idle" };
    }
  }

  private renderTabs(): void {
    this.tabsEl.innerHTML = "";
    for (const session of this.options.sessions) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "session-tab";
      tab.classList.toggle("active", session.id === this.options.activeSessionId);
      tab.dataset.testid = `session-tab-${session.id}`;

      const badge = document.createElement("span");
      badge.className = "session-tab-badge";
      badge.textContent = "B";
      const label = document.createElement("span");
      label.className = "session-tab-label";
      label.textContent = session.title;
      tab.append(badge, label);
      tab.onclick = () => {
        const now = Date.now();
        const isDoubleClick =
          this.lastTabClick.id === session.id &&
          now - this.lastTabClick.time < 400;
        if (isDoubleClick) {
          this.lastTabClick = { id: null, time: 0 };
          this.beginRenameSession(tab, label, session);
          return;
        }
        this.lastTabClick = { id: session.id, time: now };
        this.options.onSelectSession(session.id);
      };

      if (session.streaming) {
        const busy = document.createElement("span");
        busy.className = "session-tab-status busy";
        busy.title = t(this.options.language, "chatStatusStreaming");
        tab.appendChild(busy);
      } else if (session.error) {
        const error = document.createElement("span");
        error.className = "session-tab-status error";
        error.title = t(this.options.language, "chatStatusError");
        tab.appendChild(error);
      }

      if (this.options.sessions.length > 1) {
        const close = createIconButton({
          icon: "x",
          label: t(this.options.language, "chatCloseSession"),
          className: "session-tab-close",
          testId: `session-close-${session.id}`,
          plain: true,
          onClick: (event) => {
            event.stopPropagation();
            this.options.onCloseSession(session.id);
          },
        });
        tab.appendChild(close);
      }
      this.tabsEl.appendChild(tab);
    }

    const add = createIconButton({
      icon: "plus",
      label: t(this.options.language, "chatNewSession"),
      className: "session-tab-add",
      testId: "session-new",
      plain: true,
      disabled: !this.options.canCreateSession,
      onClick: () => this.options.onCreateSession(),
    });
    this.tabsEl.appendChild(add);
  }

  private beginRenameSession(
    tab: HTMLButtonElement,
    label: HTMLSpanElement,
    session: SessionTabInfo,
  ): void {
    if (tab.querySelector(".session-tab-rename")) return;
    const input = document.createElement("input");
    input.type = "text";
    input.className = "session-tab-rename";
    input.dataset.testid = `session-rename-${session.id}`;
    input.value = session.title;
    input.autocomplete = "off";
    input.spellcheck = false;
    label.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (save: boolean) => {
      if (finished) return;
      finished = true;
      const title = input.value.trim();
      if (save && title && title !== session.title) {
        this.options.onRenameSession(session.id, title);
      }
      input.replaceWith(label);
    };

    input.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(true);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(false);
      }
    };
    input.onclick = (event) => event.stopPropagation();
    input.ondblclick = (event) => event.stopPropagation();
    input.onblur = () => finish(true);
  }

  private renderMessages(): void {
    const previousScrollTop = this.messagesEl.scrollTop;
    const shouldStick = this.forceScrollToBottom || this.isNearBottom();
    this.forceScrollToBottom = false;
    const structure = this.messageStructureKey();
    const fragment = document.createDocumentFragment();

    if (this.state.messages.length === 0) {
      if (this.options.variant !== "welcome") {
        const empty = document.createElement("div");
        empty.className = "chat-empty";
        const title = document.createElement("div");
        title.className = "chat-empty-title";
        title.textContent = t(this.options.language, "chatEmptyTitle");
        const hint = document.createElement("div");
        hint.className = "chat-empty-hint";
        hint.textContent = t(this.options.language, "chatEmptyHint");
        empty.append(title, hint);
        fragment.append(empty);
      }
      for (const form of this.state.forms) {
        if (form.status === "pending") continue;
        fragment.appendChild(this.renderForm(form));
      }
      fragment.append(this.requestsEl);
      this.renderRequests();
      this.messagesEl.replaceChildren(fragment);
      this.textBubbles.clear();
      this.renderedTexts.clear();
      this.lastRenderStructure = structure;
      return;
    }

    // Streaming text arrives token by token. Reuse the existing rows and
    // update only the bubble that changed so the chat keeps its scroll
    // position and any text selection the author is holding.
    if (structure === this.lastRenderStructure) {
      if (this.updateMessageTexts()) {
        if (shouldStick) this.pinToBottom();
        return;
      }
    }

    this.textBubbles.clear();
    this.renderedTexts.clear();

    // Answered and cancelled forms belong to the message history, right where
    // the question was asked. Only pending forms stay in the footer so the
    // author can act on them, and the conversation continues below.
    const inlineForms = this.state.forms.filter(
      (form) => form.status !== "pending",
    );
    const formsByTool = new Map<string, ChatForm[]>();
    const formsByMessage = new Map<string, ChatForm[]>();
    const placedForms = new Set<string>();
    for (const form of inlineForms) {
      if (form.toolId) {
        const list = formsByTool.get(form.toolId) ?? [];
        list.push(form);
        formsByTool.set(form.toolId, list);
      }
      if (form.messageId) {
        const messageIds = form.messageId.startsWith("assistant:")
          ? [form.messageId]
          : [form.messageId, `assistant:${form.messageId}`];
        for (const messageId of messageIds) {
          const list = formsByMessage.get(messageId) ?? [];
          list.push(form);
          formsByMessage.set(messageId, list);
        }
      }
    }
    const appendForms = (
      parent: HTMLElement,
      forms: ChatForm[] | undefined,
    ): void => {
      if (!forms) return;
      for (const form of forms) {
        if (placedForms.has(form.id)) continue;
        placedForms.add(form.id);
        parent.appendChild(this.renderForm(form));
      }
    };

    for (const message of this.state.messages) {
      const messageForms = formsByMessage.get(message.id);
      if (
        message.role === "assistant" &&
        message.parts.length === 0 &&
        !messageForms
      ) {
        continue;
      }
      const row = document.createElement("div");
      row.className = `chat-message chat-message-${message.role}`;
      row.dataset.messageId = message.id;
      const role = document.createElement("div");
      role.className = "chat-message-role";
      role.textContent =
        message.role === "user"
          ? t(this.options.language, "chatYou")
          : message.role === "assistant"
            ? t(this.options.language, "chatAgent")
            : t(this.options.language, "chatSystem");
      row.appendChild(role);

      if (message.role === "system") {
        const text = messageText(message);
        if (text.length === 0) continue;
        const bubble = document.createElement("div");
        bubble.className = "chat-message-bubble";
        if (message.streaming) bubble.classList.add("streaming");
        bubble.textContent = text;
        if (message.error) bubble.classList.add("error");
        row.appendChild(bubble);
        this.textBubbles.set(`${message.id}:text`, bubble);
        this.renderedTexts.set(`${message.id}:text`, text);
      } else if (message.role === "user") {
        const text = messageText(message);
        if (text.length === 0) continue;
        const bubble = this.markdownBubble(text);
        if (message.streaming) bubble.classList.add("streaming");
        if (message.error) bubble.classList.add("error");
        row.appendChild(bubble);
        this.textBubbles.set(`${message.id}:text`, bubble);
        this.renderedTexts.set(`${message.id}:text`, text);
      } else {
        const lastText = [...message.parts]
          .reverse()
          .find((part) => part.type === "text" && part.text.length > 0);
        for (let index = 0; index < message.parts.length; index += 1) {
          const part = message.parts[index];
          if (part.type === "tool") {
            row.appendChild(this.renderTool(part.tool));
            appendForms(row, formsByTool.get(part.tool.id));
            continue;
          }
          if (part.text.length === 0) continue;
          const bubble = this.markdownBubble(part.text);
          if (message.streaming && part === lastText) {
            bubble.classList.add("streaming");
          }
          if (message.error) bubble.classList.add("error");
          row.appendChild(bubble);
          this.textBubbles.set(`${message.id}:${index}`, bubble);
          this.renderedTexts.set(`${message.id}:${index}`, part.text);
        }
      }
      appendForms(row, messageForms);
      if (row.childElementCount > 1) {
        fragment.appendChild(row);
      }
    }

    for (const form of inlineForms) {
      if (placedForms.has(form.id)) continue;
      fragment.appendChild(this.renderForm(form));
    }

    const hasAssistantContent = this.state.messages.some(
      (message) =>
        message.role === "assistant" &&
        message.parts.some(
          (part) => part.type === "tool" || part.text.length > 0,
        ),
    );
    if (this.state.streaming && !hasAssistantContent) {
      const thinking = document.createElement("div");
      thinking.className = "chat-thinking";
      thinking.textContent = t(this.options.language, "chatThinking");
      fragment.appendChild(thinking);
    }

    fragment.appendChild(this.requestsEl);
    this.renderRequests();
    this.messagesEl.replaceChildren(fragment);
    this.lastRenderStructure = structure;

    if (shouldStick) {
      this.pinToBottom();
    } else {
      this.messagesEl.scrollTop = previousScrollTop;
    }
  }

  private messageStructureKey(): string {
    const messages = this.state.messages
      .map((message) =>
        [
          message.id,
          message.role,
          message.streaming ? "s" : "",
          message.error ? "e" : "",
          message.parts
            .map((part) =>
              part.type === "tool"
                ? `tool:${JSON.stringify(part.tool)}`
                : `text:${part.text.length > 0 ? 1 : 0}`,
            )
            .join(","),
        ].join(":"),
      )
      .join("|");
    return [
      this.options.language,
      this.state.streaming ? "1" : "0",
      messages,
      JSON.stringify(this.state.permissions),
      JSON.stringify(this.state.forms),
    ].join("#");
  }

  private updateMessageTexts(): boolean {
    for (const message of this.state.messages) {
      if (message.role === "assistant" && message.parts.length === 0) {
        continue;
      }

      if (message.role !== "assistant") {
        const text = messageText(message);
        if (text.length === 0) continue;
        const key = `${message.id}:text`;
        const bubble = this.textBubbles.get(key);
        if (!bubble) return false;
        this.updateTextBubble(key, bubble, text, message.role !== "system");
        continue;
      }

      const lastText = [...message.parts]
        .reverse()
        .find((part) => part.type === "text" && part.text.length > 0);
      for (let index = 0; index < message.parts.length; index += 1) {
        const part = message.parts[index];
        if (part.type === "tool" || part.text.length === 0) continue;
        const key = `${message.id}:${index}`;
        const bubble = this.textBubbles.get(key);
        if (!bubble) return false;
        this.updateTextBubble(key, bubble, part.text, true);
        bubble.classList.toggle(
          "streaming",
          Boolean(message.streaming && part === lastText),
        );
        bubble.classList.toggle("error", Boolean(message.error));
      }
    }
    return true;
  }

  private updateTextBubble(
    key: string,
    bubble: HTMLElement,
    text: string,
    markdown: boolean,
  ): void {
    if (this.renderedTexts.get(key) === text) return;
    if (markdown) {
      bubble.innerHTML = renderMarkdownPreview(text);
    } else {
      bubble.textContent = text;
    }
    this.renderedTexts.set(key, text);
  }

  private isNearBottom(): boolean {
    return (
      this.messagesEl.scrollHeight -
        this.messagesEl.scrollTop -
        this.messagesEl.clientHeight <
      48
    );
  }

  private pinToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    const settle = () => {
      if (!this.messagesEl.isConnected) return;
      if (!this.isNearBottom()) return;
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(settle);
    } else {
      window.setTimeout(settle, 0);
    }
  }

  private markdownBubble(text: string): HTMLElement {
    const bubble = document.createElement("div");
    bubble.className = "chat-message-bubble chat-message-markdown";
    bubble.innerHTML = renderMarkdownPreview(text);
    this.bindMarkdownLinks(bubble);
    return bubble;
  }

  private bindMarkdownLinks(element: HTMLElement): void {
    element.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      if (/^(https?:|mailto:)/i.test(href)) {
        void backend.openExternalUrl(href);
      }
    });
  }

  private toolVerb(name: string): string {
    const lang = this.options.language;
    switch (name) {
      case "read":
        return t(lang, "chatToolRead");
      case "edit":
      case "multiedit":
      case "patch":
      case "apply_patch":
        return t(lang, "chatToolEdit");
      case "write":
        return t(lang, "chatToolWrite");
      case "shell":
        return t(lang, "chatToolShell");
      case "glob":
      case "grep":
        return t(lang, "chatToolSearch");
      case "webfetch":
      case "websearch":
        return t(lang, "chatToolWeb");
      case "skill":
        return t(lang, "chatToolSkill");
      case "question":
        return t(lang, "chatToolQuestion");
      default:
        return t(lang, "chatToolDefault");
    }
  }

  private toolSummary(tool: ChatToolCall): string {
    const input =
      tool.input && typeof tool.input === "object" && !Array.isArray(tool.input)
        ? (tool.input as Record<string, unknown>)
        : {};
    const pick = (...keys: string[]): string => {
      for (const key of keys) {
        const value = input[key];
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
      return "";
    };
    if (
      ["read", "edit", "write", "patch", "multiedit"].includes(tool.name) &&
      tool.files.length > 0
    ) {
      const path =
        projectRelativePath(this.options.projectRoot, tool.files[0]) ??
        tool.files[0];
      return this.clip(path, 72);
    }
    if (tool.name === "shell") return this.clip(pick("command"), 72);
    if (tool.name === "glob" || tool.name === "grep") {
      return this.clip(pick("pattern", "query"), 72);
    }
    if (tool.name === "webfetch" || tool.name === "websearch") {
      return this.clip(pick("url", "query"), 72);
    }
    if (tool.name === "skill") return this.clip(pick("name", "skill"), 72);
    if (tool.name === "question") {
      const questions = input.questions;
      if (Array.isArray(questions) && questions.length > 0) {
        const first = questions[0] as Record<string, unknown>;
        if (typeof first?.question === "string") {
          return this.clip(first.question, 72);
        }
      }
    }
    return this.clip(
      pick(
        "path",
        "filePath",
        "file",
        "description",
        "query",
        "url",
        "command",
        "name",
      ),
      72,
    );
  }

  private clip(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
  }

  private isEditTool(name: string): boolean {
    return ["edit", "write", "patch", "multiedit", "apply_patch"].includes(
      name,
    );
  }

  private toolMarkdownSection(
    lang: Language,
    labelKey: "chatToolOutput",
    text: string,
    className: string,
  ): HTMLElement {
    const section = document.createElement("div");
    section.className = `chat-tool-section ${className}`.trim();
    const label = document.createElement("div");
    label.className = "chat-tool-section-label";
    label.textContent = t(lang, labelKey);
    const content = document.createElement("div");
    content.className = "chat-tool-markdown markdown-preview";
    content.innerHTML = renderMarkdownPreview(text);
    this.bindMarkdownLinks(content);
    section.append(label, content);
    return section;
  }

  private toolActionSection(lang: Language, text: string): HTMLElement {
    const section = document.createElement("div");
    section.className = "chat-tool-section";
    const label = document.createElement("div");
    label.className = "chat-tool-section-label";
    label.textContent = t(lang, "chatToolAction");
    const content = document.createElement("div");
    content.className = "chat-tool-action";
    content.textContent = text;
    section.append(label, content);
    return section;
  }

  private splitToolOutput(tool: ChatToolCall): {
    action: string;
    result: string;
  } {
    const lines = tool.output.split(/\r?\n/);
    let action = "";
    let start = 0;
    const first = lines[0]?.trim() ?? "";
    if (/^read file\b/i.test(first)) {
      const second = lines[1]?.trim() ?? "";
      const header = second.match(
        /^(.+?)(?:,\s*lines?\s+(\d+)(?:\s*[-–]\s*(\d+))?)?$/i,
      );
      if (second.startsWith("/") && header) {
        const relative =
          projectRelativePath(this.options.projectRoot, header[1]) ?? header[1];
        const range = header[3]
          ? `${header[2]}–${header[3]}`
          : header[2] ?? "";
        action = range ? `${relative} · ${range}` : relative;
        start = 2;
      } else {
        action = first;
        start = 1;
      }
    }

    let contentLines = lines.slice(start);
    if (tool.name === "read" || start > 0) {
      contentLines = contentLines.map((line) =>
        line.replace(/^\s*\d+[:|]\s?/, ""),
      );
    }
    while (contentLines[0]?.trim() === "") contentLines.shift();
    while (contentLines[contentLines.length - 1]?.trim() === "") {
      contentLines.pop();
    }
    return { action, result: contentLines.join("\n") };
  }

  private toolActionText(tool: ChatToolCall): string {
    const input =
      tool.input && typeof tool.input === "object" && !Array.isArray(tool.input)
        ? (tool.input as Record<string, unknown>)
        : {};
    const pick = (...keys: string[]): string => {
      for (const key of keys) {
        const value = input[key];
        if (typeof value === "string" && value.trim().length > 0) {
          return value.trim();
        }
      }
      return "";
    };
    const path =
      tool.files.length > 0
        ? projectRelativePath(this.options.projectRoot, tool.files[0]) ??
          tool.files[0]
        : pick("path", "filePath", "file");
    if (tool.name === "read" || this.isEditTool(tool.name)) return path;
    if (tool.name === "shell") return pick("command");
    if (tool.name === "glob" || tool.name === "grep") {
      return pick("pattern", "query");
    }
    if (tool.name === "webfetch" || tool.name === "websearch") {
      return pick("url", "query");
    }
    return this.toolSummary(tool) || tool.name;
  }

  private toolFountainSection(
    lang: Language,
    labelKey: "chatToolOutput",
    text: string,
    className: string,
  ): HTMLElement {
    const section = document.createElement("div");
    section.className = `chat-tool-section ${className}`.trim();
    const label = document.createElement("div");
    label.className = "chat-tool-section-label";
    label.textContent = t(lang, labelKey);
    const content = document.createElement("div");
    content.className = "chat-tool-fountain";
    for (const line of classifyFountainLines(text)) {
      const lineEl = document.createElement("div");
      lineEl.className = `chat-fountain-line chat-fountain-${line.type}`;
      lineEl.textContent = line.text || "\u00a0";
      content.appendChild(lineEl);
    }
    section.append(label, content);
    return section;
  }

  private toolOutputKind(
    tool: ChatToolCall,
    result: string,
  ): "markdown" | "fountain" | "text" {
    const path = tool.files[0]?.toLowerCase() ?? "";
    if (/\.(md|markdown|mdx)$/.test(path)) return "markdown";
    if (/\.(fountain|spmd)$/.test(path)) return "fountain";
    // A known non-Markdown/non-Fountain file type is shown as plain text.
    if (/\.[a-z0-9]+$/.test(path)) return "text";

    const text = result.trim();
    if (!text) return "text";
    if (this.looksLikeFountain(text)) return "fountain";
    if (this.looksLikeMarkdown(text)) return "markdown";
    return "text";
  }

  private looksLikeFountain(text: string): boolean {
    const lines = classifyFountainLines(text).filter(
      (line) => line.text.trim().length > 0,
    );
    if (lines.length === 0) return false;
    const screenplayLines = lines.filter((line) =>
      ["scene", "character", "dialogue", "parenthetical", "transition"].includes(
        line.type,
      ),
    );
    return (
      screenplayLines.length >= 2 &&
      screenplayLines.length >= lines.length * 0.5
    );
  }

  private looksLikeMarkdown(text: string): boolean {
    const signals = [
      /^#{1,6}\s+\S/m,
      /\*\*[^*]+\*\*/,
      /(?:^|\n)\s*[-*+]\s+\S/,
      /(?:^|\n)\s*\d+\.\s+\S/,
      /\[[^\]]+\]\([^)]+\)/,
      /(?:^|\n)```/,
      /(?:^|\n)>\s+\S/,
    ];
    return signals.filter((pattern) => pattern.test(text)).length >= 2;
  }

  private renderTool(tool: ChatToolCall): HTMLElement {
    const lang = this.options.language;
    const container = document.createElement("div");
    container.className = `chat-tool chat-tool-${tool.status}`;
    container.dataset.testid = `tool-${tool.id}`;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "chat-tool-header";
    header.dataset.testid = `tool-toggle-${tool.id}`;
    header.setAttribute("aria-expanded", "false");
    const icon = document.createElement("span");
    icon.className = `chat-tool-icon ${tool.status}`;
    icon.appendChild(
      createIcon(
        tool.status === "completed"
          ? "check"
          : tool.status === "error"
            ? "x"
            : "circle",
        14,
      ),
    );
    icon.title =
      tool.status === "completed"
        ? t(lang, "chatToolCompleted")
        : tool.status === "error"
          ? t(lang, "chatToolFailed")
          : t(lang, "chatToolRunning");
    const label = document.createElement("span");
    label.className = "chat-tool-label";
    const summary = this.toolSummary(tool);
    label.textContent = [this.toolVerb(tool.name), summary]
      .filter(Boolean)
      .join(" ");
    const chevron = document.createElement("span");
    chevron.className = "chat-tool-chevron";
    chevron.appendChild(createIcon("chevron-down", 12));
    header.append(icon, label, chevron);

    const details = document.createElement("div");
    details.className = "chat-tool-details";
    details.hidden = true;
    header.onclick = () => {
      details.hidden = !details.hidden;
      header.setAttribute("aria-expanded", String(!details.hidden));
    };

    const body = document.createElement("div");
    body.className = "chat-tool-body";
    const prompts = questionPrompts(tool);
    const files = document.createElement("div");
    files.className = "chat-tool-files";
    if (tool.files.length > 0) {
      tool.files.forEach((file, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-tool-file";
        button.dataset.testid = `tool-file-${tool.id}-${index}`;
        const showDiff = this.isEditTool(tool.name) && tool.status === "completed";
        const displayPath =
          projectRelativePath(this.options.projectRoot, file) ?? file;
        button.textContent = showDiff
          ? `${displayPath} · ${t(lang, "chatShowDiff")}`
          : displayPath;
        button.title = showDiff
          ? t(lang, "chatShowDiff")
          : t(lang, "chatOpenFile");
        button.onclick = () =>
          this.options.onOpenToolFile(file, showDiff);
        files.appendChild(button);
      });
    }

    if (prompts) {
      body.appendChild(renderQuestionTool(tool, prompts));
    } else {
      const { action, result } = this.splitToolOutput(tool);
      const actionText = action || this.toolActionText(tool);
      if (actionText) {
        body.appendChild(this.toolActionSection(lang, actionText));
      }
      if (result) {
        const output = this.clip(result, 8000);
        const kind = this.toolOutputKind(tool, result);
        body.appendChild(
          kind === "fountain"
            ? this.toolFountainSection(lang, "chatToolOutput", output, "")
            : kind === "markdown"
              ? this.toolMarkdownSection(lang, "chatToolOutput", output, "")
              : this.toolSection(lang, "chatToolOutput", output, ""),
        );
      }
      if (tool.error) {
        body.appendChild(
          this.toolSection(
            lang,
            "chatToolError",
            this.clip(tool.error, 4000),
            "error",
          ),
        );
      }
    }
    details.appendChild(body);
    container.append(header);
    if (tool.files.length > 0) {
      container.appendChild(files);
    }
    container.appendChild(details);
    return container;
  }

  private toolSection(
    lang: Language,
    labelKey:
      | "chatToolInput"
      | "chatToolOutput"
      | "chatToolError",
    text: string,
    className: string,
  ): HTMLElement {
    const section = document.createElement("div");
    section.className = `chat-tool-section ${className}`.trim();
    const label = document.createElement("div");
    label.className = "chat-tool-section-label";
    label.textContent = t(lang, labelKey);
    const pre = document.createElement("pre");
    pre.className = "chat-tool-pre";
    pre.textContent = text;
    section.append(label, pre);
    return section;
  }

  private renderRequests(): void {
    this.requestsEl.innerHTML = "";
    const pendingPermissions = this.state.permissions.filter(
      (permission) => permission.status === "pending",
    );
    const forms = this.state.forms.filter(
      (form) => form.status === "pending",
    );
    const pendingFormIds = new Set(
      forms
        .filter((form) => form.status === "pending")
        .map((form) => form.id),
    );
    for (const id of [...this.formDrafts.keys()]) {
      if (!pendingFormIds.has(id)) this.formDrafts.delete(id);
    }

    if (pendingPermissions.length === 0 && forms.length === 0) {
      this.requestsEl.hidden = true;
      return;
    }
    for (const permission of pendingPermissions) {
      this.requestsEl.appendChild(this.renderPermission(permission));
    }
    for (const form of forms) {
      this.requestsEl.appendChild(this.renderForm(form));
    }
    this.requestsEl.hidden = false;
  }

  private renderPermission(permission: ChatPermission): HTMLElement {
    const lang = this.options.language;
    const card = document.createElement("div");
    card.className = "chat-request chat-permission";
    card.dataset.testid = `permission-${permission.id}`;
    const title = document.createElement("div");
    title.className = "chat-request-title";
    title.textContent = t(lang, "chatPermissionTitle");
    const target = document.createElement("div");
    target.className = "chat-request-target";
    target.textContent = [permission.action, ...permission.resources]
      .filter(Boolean)
      .join(" · ");
    card.append(title, target);
    if (permission.message) {
      const message = document.createElement("div");
      message.className = "chat-request-message";
      message.textContent = permission.message;
      card.appendChild(message);
    }
    const actions = document.createElement("div");
    actions.className = "chat-request-actions";
    const add = (
      decision: "once" | "always" | "reject",
      labelKey: "chatPermissionOnce" | "chatPermissionAlways" | "chatPermissionReject",
      className: string,
    ) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chat-request-btn ${className}`;
      button.dataset.testid = `permission-${decision}-${permission.id}`;
      button.textContent = t(lang, labelKey);
      button.onclick = () =>
        this.options.onPermissionReply(permission.id, decision);
      actions.appendChild(button);
    };
    add("once", "chatPermissionOnce", "primary");
    add("always", "chatPermissionAlways", "");
    add("reject", "chatPermissionReject", "danger");
    card.appendChild(actions);
    return card;
  }

  private formValue(formId: string, field: OpenCodeFormField): unknown {
    const drafts = this.formDrafts.get(formId);
    if (drafts && field.key in drafts) return drafts[field.key];
    return field.default;
  }

  private setFormValue(formId: string, key: string, value: unknown): void {
    const drafts = this.formDrafts.get(formId) ?? {};
    drafts[key] = value;
    this.formDrafts.set(formId, drafts);
  }

  private formAnswer(form: ChatForm): Record<string, unknown> {
    const answer: Record<string, unknown> = {};
    for (const field of form.fields) {
      if (field.hidden || field.type === "external") continue;
      let value = this.formValue(form.id, field);
      if (value === undefined || value === null) continue;
      if (typeof value === "string") {
        value = value.trim();
        if (!value) continue;
      }
      if (Array.isArray(value) && value.length === 0) continue;
      if (field.type === "integer") {
        const number = Number(value);
        if (!Number.isFinite(number)) continue;
        value = Math.trunc(number);
      } else if (field.type === "number") {
        const number = Number(value);
        if (!Number.isFinite(number)) continue;
        value = number;
      }
      answer[field.key] = value;
    }
    return answer;
  }

  private formReady(form: ChatForm): boolean {
    for (const field of form.fields) {
      if (!field.required || field.hidden || field.type === "external") {
        continue;
      }
      if (field.type === "boolean") continue;
      const value = this.formValue(form.id, field);
      if (value === undefined || value === null) return false;
      if (typeof value === "string" && !value.trim()) return false;
      if (Array.isArray(value) && value.length === 0) return false;
    }
    return true;
  }

  private renderForm(form: ChatForm): HTMLElement {
    const lang = this.options.language;
    const card = document.createElement("div");
    card.className = `chat-request chat-form ${form.status}`;
    card.dataset.testid = `form-${form.id}`;
    const title = document.createElement("div");
    title.className = "chat-request-title";
    title.textContent = t(lang, "chatFormTitle");
    card.appendChild(title);

    if (form.status === "answered") {
      const status = document.createElement("div");
      status.className = "chat-form-status answered";
      status.textContent = t(lang, "chatFormAnswered");
      card.appendChild(status);
      const detail = renderAnsweredForm(form, lang);
      if (detail) card.appendChild(detail);
      return card;
    }

    if (form.status === "cancelled") {
      const status = document.createElement("div");
      status.className = "chat-form-status cancelled";
      status.textContent = t(lang, "chatFormCancelled");
      card.appendChild(status);
      if (form.message) {
        const detail = document.createElement("div");
        detail.className = "chat-form-summary";
        detail.textContent = form.message;
        card.appendChild(detail);
      }
      return card;
    }

    const fields = form.fields.filter((field) => !field.hidden);
    if (fields.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-form-summary";
      empty.textContent = t(lang, "chatFormCancelled");
      card.appendChild(empty);
      return card;
    }

    const submit = document.createElement("button");
    submit.type = "button";
    submit.className = "chat-request-btn primary";
    submit.dataset.testid = `form-submit-${form.id}`;
    submit.textContent = t(lang, "chatFormSubmit");
    const refresh = () => {
      submit.disabled = !this.formReady(form);
    };

    for (const field of fields) {
      card.appendChild(this.renderFormField(form, field, refresh));
    }

    const actions = document.createElement("div");
    actions.className = "chat-request-actions";
    submit.onclick = () => {
      this.options.onFormReply(form.id, this.formAnswer(form));
    };
    refresh();
    actions.appendChild(submit);
    card.appendChild(actions);
    return card;
  }

  private renderFormField(
    form: ChatForm,
    field: OpenCodeFormField,
    changed: () => void,
  ): HTMLElement {
    const lang = this.options.language;
    const wrapper = document.createElement("div");
    wrapper.className = "chat-form-field";
    wrapper.dataset.testid = `form-field-${form.id}-${field.key}`;
    const label = document.createElement("div");
    label.className = "chat-form-label";
    label.textContent = field.title || field.key;
    if (field.required) {
      const required = document.createElement("span");
      required.className = "chat-form-required";
      required.textContent = " *";
      label.appendChild(required);
    }
    wrapper.appendChild(label);
    if (field.description) {
      const description = document.createElement("div");
      description.className = "chat-form-description";
      description.textContent = field.description;
      wrapper.appendChild(description);
    }

    const value = this.formValue(form.id, field);
    if (field.type === "boolean") {
      const row = document.createElement("label");
      row.className = "chat-form-check";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.dataset.testid = `form-input-${form.id}-${field.key}`;
      input.checked = Boolean(value);
      input.onchange = () => {
        this.setFormValue(form.id, field.key, input.checked);
        changed();
      };
      const text = document.createElement("span");
      text.textContent = field.description || field.title || field.key;
      row.append(input, text);
      wrapper.appendChild(row);
      return wrapper;
    }

    if (field.type === "number" || field.type === "integer") {
      const input = document.createElement("input");
      input.type = "number";
      input.className = "chat-form-input";
      input.dataset.testid = `form-input-${form.id}-${field.key}`;
      input.step = field.type === "integer" ? "1" : "any";
      input.placeholder = field.placeholder ?? "";
      input.value =
        typeof value === "number" || typeof value === "string"
          ? String(value)
          : "";
      input.oninput = () => {
        this.setFormValue(
          form.id,
          field.key,
          input.value === "" ? undefined : Number(input.value),
        );
        changed();
      };
      wrapper.appendChild(input);
      return wrapper;
    }

    if (field.type === "multiselect") {
      const selected = Array.isArray(value) ? value.map(String) : [];
      for (const option of field.options ?? []) {
        const row = document.createElement("label");
        row.className = "chat-form-check";
        const input = document.createElement("input");
        input.type = "checkbox";
        input.dataset.testid = `form-input-${form.id}-${field.key}-${option.value}`;
        input.checked = selected.includes(option.value);
        input.onchange = () => {
          const next = new Set(
            Array.isArray(this.formValue(form.id, field))
              ? (this.formValue(form.id, field) as string[]).map(String)
              : [],
          );
          if (input.checked) next.add(option.value);
          else next.delete(option.value);
          this.setFormValue(form.id, field.key, [...next]);
          changed();
        };
        const text = document.createElement("span");
        text.textContent = option.description
          ? `${option.label} — ${option.description}`
          : option.label;
        row.append(input, text);
        wrapper.appendChild(row);
      }
      return wrapper;
    }

    if (field.type === "external") {
      const link = document.createElement("a");
      link.className = "chat-form-link";
      link.href = field.placeholder ?? "#";
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = field.title || field.placeholder || t(lang, "chatFormOpenLink");
      wrapper.appendChild(link);
      return wrapper;
    }

    if (field.options && field.options.length > 0) {
      const selected = typeof value === "string" ? value : "";
      const radios: HTMLInputElement[] = [];
      for (const option of field.options) {
        const row = document.createElement("label");
        row.className = "chat-form-check";
        const input = document.createElement("input");
        input.type = "radio";
        input.name = `form-${form.id}-${field.key}`;
        input.dataset.testid = `form-input-${form.id}-${field.key}-${option.value}`;
        input.value = option.value;
        input.checked = selected === option.value;
        radios.push(input);
        input.onchange = () => {
          custom.value = "";
          this.setFormValue(form.id, field.key, option.value);
          changed();
        };
        const text = document.createElement("span");
        text.textContent = option.description
          ? `${option.label} — ${option.description}`
          : option.label;
        row.append(input, text);
        wrapper.appendChild(row);
      }
      const custom = document.createElement("input");
      custom.type = "text";
      custom.className = "chat-form-input";
      custom.dataset.testid = `form-input-${form.id}-${field.key}-custom`;
      custom.placeholder = t(lang, "chatFormOther");
      custom.value =
        typeof value === "string" &&
        !field.options.some((option) => option.value === value)
          ? value
          : "";
      custom.hidden = !field.custom;
      custom.oninput = () => {
        for (const radio of radios) radio.checked = false;
        this.setFormValue(form.id, field.key, custom.value);
        changed();
      };
      wrapper.appendChild(custom);
      return wrapper;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "chat-form-input";
    input.dataset.testid = `form-input-${form.id}-${field.key}`;
    input.placeholder = field.placeholder ?? t(lang, "chatFormFreeText");
    input.value = typeof value === "string" ? value : "";
    input.oninput = () => {
      this.setFormValue(form.id, field.key, input.value);
      changed();
    };
    wrapper.appendChild(input);
    return wrapper;
  }
}
