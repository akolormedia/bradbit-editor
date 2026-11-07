import { t } from "../i18n";
import { KitCatalog, Language, OpenCodeFormField, OpenCodeModel } from "../types";
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
  activeCompletion,
  CompletionToken,
  filterCommands,
  filterProjectFiles,
  replaceCompletion,
} from "./composer";

export interface ChatPanelOptions {
  language: Language;
  projectName: string;
  projectRoot: string;
  sessions: SessionTabInfo[];
  activeSessionId: string | null;
  canCreateSession: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onOpenToolFile: (path: string, showDiff: boolean) => void;
  onPermissionReply: (
    requestId: string,
    decision: "once" | "always" | "reject",
  ) => void;
  onFormReply: (formId: string, answer: Record<string, unknown>) => void;
  kit: KitCatalog;
  models: OpenCodeModel[];
  projectFiles: QuickOpenFile[];
  onAgentChange: (agent: string | null) => void;
  onModelChange: (
    providerId: string,
    modelId: string,
    variant?: string,
  ) => void;
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
  private agentSelect: HTMLSelectElement;
  private modelSelect: HTMLSelectElement;
  private attachBtn: HTMLButtonElement;
  private popoverEl: HTMLElement;
  private popoverToken: CompletionToken | null = null;
  private popoverItems: Array<{
    value: string;
    label: string;
    description: string;
  }> = [];
  private popoverIndex = 0;
  private popoverMode: "command" | "mention" | null = null;
  private lastKit: KitCatalog | null = null;
  private lastModels: OpenCodeModel[] | null = null;
  private sendBtn: HTMLButtonElement;
  private stopBtn: HTMLButtonElement;
  private errorEl: HTMLElement;
  private errorText: HTMLElement;
  private statusEl: HTMLElement;
  private statusDot: HTMLElement;
  private contextEl: HTMLElement;
  private tabsEl: HTMLElement;
  private titleEl: HTMLElement;
  private subtitleEl: HTMLElement;
  private stickToBottom = true;
  private drafts = new Map<string, string>();
  private draftSessionId: string | null = null;
  private formDrafts = new Map<string, Record<string, unknown>>();

  constructor(options: ChatPanelOptions) {
    this.options = options;
    this.draftSessionId = options.activeSessionId;
    this.element = document.createElement("div");
    this.element.className = "chat-panel";
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
    this.errorEl.append(this.errorText, retry);
    this.errorEl.hidden = true;

    this.messagesEl = document.createElement("div");
    this.messagesEl.className = "chat-messages";
    this.messagesEl.addEventListener("scroll", () => {
      const distance =
        this.messagesEl.scrollHeight -
        this.messagesEl.scrollTop -
        this.messagesEl.clientHeight;
      this.stickToBottom = distance < 48;
    });

    this.requestsEl = document.createElement("div");
    this.requestsEl.className = "chat-requests";
    this.requestsEl.hidden = true;

    const composer = document.createElement("div");
    composer.className = "chat-composer";
    const toolbar = document.createElement("div");
    toolbar.className = "chat-composer-toolbar";
    this.agentSelect = document.createElement("select");
    this.agentSelect.className = "chat-composer-select";
    this.agentSelect.dataset.testid = "chat-agent-select";
    this.agentSelect.title = t(options.language, "chatAgentLabel");
    this.agentSelect.setAttribute(
      "aria-label",
      t(options.language, "chatAgentLabel"),
    );
    this.agentSelect.onchange = () =>
      this.options.onAgentChange(this.agentSelect.value || null);
    this.modelSelect = document.createElement("select");
    this.modelSelect.className = "chat-composer-select";
    this.modelSelect.dataset.testid = "chat-model-select";
    this.modelSelect.title = t(options.language, "chatModelLabel");
    this.modelSelect.setAttribute(
      "aria-label",
      t(options.language, "chatModelLabel"),
    );
    this.modelSelect.onchange = () => {
      const value = this.modelSelect.value;
      if (!value) return;
      const slash = value.indexOf("/");
      if (slash <= 0) return;
      const providerId = value.slice(0, slash);
      const rest = value.slice(slash + 1);
      const hash = rest.indexOf("#");
      const modelId = hash >= 0 ? rest.slice(0, hash) : rest;
      const variant = hash >= 0 ? rest.slice(hash + 1) : undefined;
      this.options.onModelChange(providerId, modelId, variant);
    };
    this.attachBtn = document.createElement("button");
    this.attachBtn.type = "button";
    this.attachBtn.className = "icon-btn chat-attach-btn";
    this.attachBtn.dataset.testid = "chat-attach";
    this.attachBtn.title = t(options.language, "chatAttachFile");
    this.attachBtn.setAttribute(
      "aria-label",
      t(options.language, "chatAttachFile"),
    );
    this.attachBtn.textContent = "＋";
    this.attachBtn.onclick = () => this.openMentionAtCursor();
    toolbar.append(this.agentSelect, this.modelSelect, this.attachBtn);

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
    const footer = document.createElement("div");
    footer.className = "chat-composer-footer";
    const hint = document.createElement("span");
    hint.className = "chat-composer-hint";
    hint.textContent = t(options.language, "chatEnterHint");
    const buttons = document.createElement("div");
    buttons.className = "chat-composer-actions";
    this.sendBtn = document.createElement("button");
    this.sendBtn.className = "toolbar-btn primary chat-send-btn";
    this.sendBtn.dataset.testid = "chat-send";
    this.sendBtn.textContent = t(options.language, "chatSend");
    this.sendBtn.onclick = () => this.submit();
    this.stopBtn = document.createElement("button");
    this.stopBtn.className = "toolbar-btn danger chat-stop-btn";
    this.stopBtn.dataset.testid = "chat-stop";
    this.stopBtn.textContent = t(options.language, "chatStop");
    this.stopBtn.onclick = () => this.options.onStop();
    this.stopBtn.hidden = true;
    buttons.append(this.sendBtn, this.stopBtn);
    footer.append(hint, buttons);

    this.popoverEl = document.createElement("div");
    this.popoverEl.className = "chat-composer-popover";
    this.popoverEl.hidden = true;
    this.popoverEl.setAttribute("role", "listbox");

    composer.append(toolbar, this.composer, footer, this.popoverEl);

    this.element.append(
      this.tabsEl,
      header,
      this.errorEl,
      this.messagesEl,
      this.requestsEl,
      composer,
    );
    this.update(initialChatState, options);
  }

  public update(state: ChatState, options?: Partial<ChatPanelOptions>): void {
    if (options) {
      this.options = { ...this.options, ...options };
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
      this.hidePopover();
    }
    const sessionIds = new Set(this.options.sessions.map((session) => session.id));
    for (const id of [...this.drafts.keys()]) {
      if (!sessionIds.has(id)) this.drafts.delete(id);
    }

    if (
      this.lastKit !== this.options.kit ||
      this.lastModels !== this.options.models
    ) {
      this.lastKit = this.options.kit;
      this.lastModels = this.options.models;
      this.renderAgentOptions(state.agent);
      this.renderModelOptions(state.model);
    }
    this.syncSelectValue(this.agentSelect, state.agent, state.agent ?? "");
    this.syncSelectValue(this.modelSelect, state.model, state.model ?? "");

    this.titleEl.textContent = t(lang, "chatHeaderTitle");
    this.composer.placeholder = t(lang, "chatPlaceholder");
    this.sendBtn.textContent = t(lang, "chatSend");
    this.stopBtn.textContent = t(lang, "chatStop");
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
      this.errorEl.hidden = false;
    } else {
      this.errorEl.hidden = true;
    }

    this.renderMessages();
    this.renderRequests();
    this.updateSendState();
  }

  public clearDraft(): void {
    this.hidePopover();
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
    this.hidePopover();
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

  private syncSelectValue(
    select: HTMLSelectElement,
    value: string | null,
    label: string,
  ): void {
    if (!value) {
      select.value = "";
      return;
    }
    if (![...select.options].some((option) => option.value === value)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label || value;
      select.appendChild(option);
    }
    select.value = value;
  }

  private renderAgentOptions(selected: string | null): void {
    const lang = this.options.language;
    this.agentSelect.innerHTML = "";
    const fallback = document.createElement("option");
    fallback.value = "";
    fallback.textContent = t(lang, "chatAgentDefault");
    this.agentSelect.appendChild(fallback);
    for (const agent of this.options.kit.agents) {
      const option = document.createElement("option");
      option.value = agent.name;
      option.textContent = agent.name;
      option.title = agent.description;
      this.agentSelect.appendChild(option);
    }
    this.syncSelectValue(this.agentSelect, selected, selected ?? "");
  }

  private renderModelOptions(selected: string | null): void {
    const lang = this.options.language;
    this.modelSelect.innerHTML = "";
    const fallback = document.createElement("option");
    fallback.value = "";
    fallback.textContent = t(lang, "chatModelDefault");
    this.modelSelect.appendChild(fallback);

    const byProvider = new Map<string, OpenCodeModel[]>();
    for (const model of this.options.models) {
      const models = byProvider.get(model.providerId) ?? [];
      models.push(model);
      byProvider.set(model.providerId, models);
    }
    const currentProvider = selected?.split("/")[0] ?? "opencode-go";
    const providers = [...byProvider.keys()].sort((a, b) => {
      if (a === currentProvider) return -1;
      if (b === currentProvider) return 1;
      if (a === "opencode-go") return -1;
      if (b === "opencode-go") return 1;
      return a.localeCompare(b);
    });
    for (const provider of providers) {
      const group = document.createElement("optgroup");
      group.label = provider;
      for (const model of byProvider.get(provider)!.sort((a, b) =>
        a.name.localeCompare(b.name),
      )) {
        const option = document.createElement("option");
        option.value = `${provider}/${model.id}`;
        option.textContent = model.name;
        group.appendChild(option);
        for (const variant of model.variants) {
          const variantOption = document.createElement("option");
          variantOption.value = `${provider}/${model.id}#${variant}`;
          variantOption.textContent = `${model.name} · ${variant}`;
          group.appendChild(variantOption);
        }
      }
      this.modelSelect.appendChild(group);
    }
    this.syncSelectValue(this.modelSelect, selected, selected ?? "");
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
        ? filterCommands(this.options.kit.commands, token.query).map(
            (command) => ({
              value: command.name,
              label: `/${command.name}`,
              description: command.description,
            }),
          )
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
    this.popoverEl
      .querySelector<HTMLElement>('[data-active="true"]')
      ?.scrollIntoView?.({ block: "nearest" });
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
    this.agentSelect.disabled = !ready;
    this.modelSelect.disabled = !ready;
    this.attachBtn.disabled = !ready;
    if (this.composer.disabled) {
      this.hidePopover();
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
      tab.onclick = () => this.options.onSelectSession(session.id);

      const badge = document.createElement("span");
      badge.className = "session-tab-badge";
      badge.textContent = "B";
      const label = document.createElement("span");
      label.className = "session-tab-label";
      label.textContent = session.title;
      tab.append(badge, label);

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
        const close = document.createElement("span");
        close.className = "session-tab-close";
        close.dataset.testid = `session-close-${session.id}`;
        close.textContent = "×";
        close.title = t(this.options.language, "chatCloseSession");
        close.setAttribute("aria-label", t(this.options.language, "chatCloseSession"));
        close.onclick = (event) => {
          event.stopPropagation();
          this.options.onCloseSession(session.id);
        };
        tab.appendChild(close);
      }
      this.tabsEl.appendChild(tab);
    }

    const add = document.createElement("button");
    add.type = "button";
    add.className = "session-tab-add";
    add.dataset.testid = "session-new";
    add.textContent = "＋";
    add.title = t(this.options.language, "chatNewSession");
    add.setAttribute("aria-label", t(this.options.language, "chatNewSession"));
    add.disabled = !this.options.canCreateSession;
    add.onclick = () => this.options.onCreateSession();
    this.tabsEl.appendChild(add);
  }

  private renderMessages(): void {
    const previousScrollTop = this.messagesEl.scrollTop;
    const shouldStick = this.stickToBottom;
    this.messagesEl.innerHTML = "";
    if (this.state.messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "chat-empty";
      const title = document.createElement("div");
      title.className = "chat-empty-title";
      title.textContent = t(this.options.language, "chatEmptyTitle");
      const hint = document.createElement("div");
      hint.className = "chat-empty-hint";
      hint.textContent = t(this.options.language, "chatEmptyHint");
      empty.append(title, hint);
      this.messagesEl.appendChild(empty);
      return;
    }

    for (const message of this.state.messages) {
      if (message.role === "assistant" && message.parts.length === 0) {
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

      if (message.role === "user" || message.role === "system") {
        const text = messageText(message);
        if (text.length === 0) continue;
        const bubble = document.createElement("div");
        bubble.className = "chat-message-bubble";
        if (message.streaming) bubble.classList.add("streaming");
        bubble.textContent = text;
        if (message.error) bubble.classList.add("error");
        row.appendChild(bubble);
      } else {
        const lastText = [...message.parts]
          .reverse()
          .find((part) => part.type === "text" && part.text.length > 0);
        for (const part of message.parts) {
          if (part.type === "tool") {
            row.appendChild(this.renderTool(part.tool));
            continue;
          }
          if (part.text.length === 0) continue;
          const bubble = document.createElement("div");
          bubble.className = "chat-message-bubble";
          if (message.streaming && part === lastText) {
            bubble.classList.add("streaming");
          }
          bubble.textContent = part.text;
          if (message.error) bubble.classList.add("error");
          row.appendChild(bubble);
        }
      }
      if (row.childElementCount > 1) {
        this.messagesEl.appendChild(row);
      }
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
      this.messagesEl.appendChild(thinking);
    }

    if (shouldStick) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    } else {
      this.messagesEl.scrollTop = previousScrollTop;
    }
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

  private formatInput(input: unknown): string {
    if (input === null || input === undefined) return "";
    if (typeof input === "string") return this.clip(input, 6000);
    try {
      return this.clip(JSON.stringify(input, null, 2), 6000);
    } catch {
      return this.clip(String(input), 6000);
    }
  }

  private isEditTool(name: string): boolean {
    return ["edit", "write", "patch", "multiedit", "apply_patch"].includes(
      name,
    );
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
    icon.textContent =
      tool.status === "completed" ? "✓" : tool.status === "error" ? "✕" : "●";
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
    chevron.textContent = "⌄";
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

    const inputText = this.formatInput(tool.input);
    if (inputText) {
      body.appendChild(
        this.toolSection(lang, "chatToolInput", inputText, ""),
      );
    }
    if (tool.output) {
      body.appendChild(
        this.toolSection(
          lang,
          "chatToolOutput",
          this.clip(tool.output, 8000),
          "",
        ),
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
    const forms = this.state.forms;
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

  private optionLabel(field: OpenCodeFormField, value: string): string {
    return (
      field.options?.find((option) => option.value === value)?.label ?? value
    );
  }

  private formAnswerSummary(form: ChatForm): string {
    if (!form.answer) return "";
    const parts: string[] = [];
    for (const field of form.fields) {
      if (field.hidden || field.type === "external") continue;
      const value = form.answer[field.key];
      if (value === undefined || value === null) continue;
      let display: string;
      if (Array.isArray(value)) {
        display = value
          .map((item) => this.optionLabel(field, String(item)))
          .join(", ");
      } else if (typeof value === "boolean") {
        display = value
          ? t(this.options.language, "chatFormYes")
          : t(this.options.language, "chatFormNo");
      } else {
        display = this.optionLabel(field, String(value));
      }
      parts.push(`${field.title || field.key}: ${display}`);
    }
    return parts.join(" · ");
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
      const summary = this.formAnswerSummary(form);
      if (summary) {
        const detail = document.createElement("div");
        detail.className = "chat-form-summary";
        detail.textContent = summary;
        card.appendChild(detail);
      }
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
      link.textContent = field.title || field.placeholder || "Abrir";
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
