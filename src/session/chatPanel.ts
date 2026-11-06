import { t } from "../i18n";
import { Language } from "../types";
import { ChatState, initialChatState } from "./chatState";
import { SessionTabInfo } from "./sessionTabs";

export interface ChatPanelOptions {
  language: Language;
  projectName: string;
  sessions: SessionTabInfo[];
  activeSessionId: string | null;
  canCreateSession: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  onRetry: () => void;
  onToggleEditor: () => void;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
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
  private composer: HTMLTextAreaElement;
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
  private editorBtn: HTMLButtonElement;
  private stickToBottom = true;
  private drafts = new Map<string, string>();
  private draftSessionId: string | null = null;

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
    this.editorBtn = document.createElement("button");
    this.editorBtn.className = "icon-btn session-editor-toggle";
    this.editorBtn.dataset.testid = "session-toggle-editor";
    this.editorBtn.textContent = "◫";
    this.editorBtn.onclick = () => this.options.onToggleEditor();
    actions.append(this.contextEl, this.editorBtn);
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

    const composer = document.createElement("div");
    composer.className = "chat-composer";
    this.composer = document.createElement("textarea");
    this.composer.className = "chat-input";
    this.composer.dataset.testid = "chat-input";
    this.composer.rows = 3;
    this.composer.oninput = () => {
      if (this.draftSessionId) {
        this.drafts.set(this.draftSessionId, this.composer.value);
      }
      this.updateSendState();
    };
    this.composer.onkeydown = (event) => {
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
    composer.append(this.composer, footer);

    this.element.append(this.tabsEl, header, this.errorEl, this.messagesEl, composer);
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
    }
    const sessionIds = new Set(this.options.sessions.map((session) => session.id));
    for (const id of [...this.drafts.keys()]) {
      if (!sessionIds.has(id)) this.drafts.delete(id);
    }

    this.titleEl.textContent = t(lang, "chatHeaderTitle");
    this.editorBtn.title = t(lang, "chatToggleEditor");
    this.editorBtn.setAttribute("aria-label", t(lang, "chatToggleEditor"));
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
      const total =
        state.tokens.input +
        state.tokens.output +
        state.tokens.reasoning;
      this.contextEl.textContent = t(lang, "chatTokens", {
        count: formatTokens(total),
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
    this.updateSendState();
  }

  public clearDraft(): void {
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
      if (message.role === "assistant" && message.text.length === 0) {
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
      const bubble = document.createElement("div");
      bubble.className = "chat-message-bubble";
      if (message.streaming) bubble.classList.add("streaming");
      bubble.textContent = message.text;
      if (message.error) bubble.classList.add("error");
      row.append(role, bubble);
      this.messagesEl.appendChild(row);
    }

    const hasAssistantText = this.state.messages.some(
      (message) => message.role === "assistant" && message.text.length > 0,
    );
    if (this.state.streaming && !hasAssistantText) {
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
}
