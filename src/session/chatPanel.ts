import { t } from "../i18n";
import { Language } from "../types";
import {
  ChatPermission,
  ChatState,
  ChatToolCall,
  initialChatState,
  messageText,
} from "./chatState";
import { SessionTabInfo } from "./sessionTabs";
import { projectRelativePath } from "./chatPaths";

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
  onToggleEditor: () => void;
  onSelectSession: (id: string) => void;
  onCreateSession: () => void;
  onCloseSession: (id: string) => void;
  onOpenToolFile: (path: string, showDiff: boolean) => void;
  onPermissionReply: (
    requestId: string,
    decision: "once" | "always" | "reject",
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
    const pending = this.state.permissions.filter(
      (permission) => permission.status === "pending",
    );
    if (pending.length === 0) {
      this.requestsEl.hidden = true;
      return;
    }
    for (const permission of pending) {
      this.requestsEl.appendChild(this.renderPermission(permission));
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
}
