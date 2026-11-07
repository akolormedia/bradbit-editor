import {
  OpenCodeChatMessage,
  OpenCodeEvent,
  OpenCodeForm,
  OpenCodeFormField,
  OpenCodePermission,
  OpenCodeSession,
  OpenCodeToolCall,
} from "../types";

export type ChatStatus = "idle" | "starting" | "ready" | "error";

export interface ChatTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ChatToolCall {
  id: string;
  name: string;
  status: "streaming" | "running" | "completed" | "error";
  input: unknown;
  output: string;
  error: string;
  executed: boolean;
  files: string[];
}

export type ChatPart =
  | { type: "text"; ordinal: number; text: string }
  | { type: "tool"; tool: ChatToolCall };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  parts: ChatPart[];
  streaming?: boolean;
  error?: boolean;
}

export interface ChatPermission {
  id: string;
  action: string;
  resources: string[];
  save: string[];
  message: string;
  toolId: string | null;
  status: "pending" | "allowed" | "rejected";
}

export interface ChatForm {
  id: string;
  title: string;
  kind: string;
  toolId: string | null;
  messageId: string | null;
  fields: OpenCodeFormField[];
  status: "pending" | "answered" | "cancelled";
  answer: Record<string, unknown> | null;
  message: string | null;
}

export interface ChatState {
  status: ChatStatus;
  sessionId: string | null;
  title: string;
  model: string | null;
  agent: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string;
  tokens: ChatTokens | null;
  permissions: ChatPermission[];
  forms: ChatForm[];
}

export const initialChatState: ChatState = {
  status: "idle",
  sessionId: null,
  title: "",
  model: null,
  agent: null,
  messages: [],
  streaming: false,
  error: "",
  tokens: null,
  permissions: [],
  forms: [],
};

export function messageText(message: ChatMessage): string {
  return message.parts
    .filter((part): part is Extract<ChatPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

export function chatStarting(_state: ChatState): ChatState {
  return { ...initialChatState, status: "starting" };
}

export function chatStarted(
  state: ChatState,
  session: OpenCodeSession,
): ChatState {
  return {
    ...state,
    status: "ready",
    sessionId: session.id,
    title: session.title,
    agent: session.agent ?? state.agent,
    model: session.model ?? state.model,
    error: "",
  };
}

function sumTokens(messages: OpenCodeChatMessage[]): ChatTokens | null {
  let total: ChatTokens | null = null;
  for (const message of messages) {
    if (!message.tokens) continue;
    total ??= {
      input: 0,
      output: 0,
      reasoning: 0,
      cacheRead: 0,
      cacheWrite: 0,
    };
    total.input += message.tokens.input;
    total.output += message.tokens.output;
    total.reasoning += message.tokens.reasoning;
    total.cacheRead += message.tokens.cacheRead;
    total.cacheWrite += message.tokens.cacheWrite;
  }
  return total;
}

function toolFromHistory(tool: OpenCodeToolCall): ChatToolCall {
  return {
    id: tool.id,
    name: tool.name,
    status: tool.status,
    input: tool.input,
    output: tool.output,
    error: tool.error,
    executed: tool.executed,
    files: [...tool.files],
  };
}

export function chatFromHistory(
  session: OpenCodeSession,
  messages: OpenCodeChatMessage[],
): ChatState {
  const state = chatStarted(chatStarting(initialChatState), session);
  const model = [...messages].reverse().find((message) => message.model)?.model;
  const agent = [...messages].reverse().find((message) => message.agent)?.agent;
  return {
    ...state,
    model: model ?? null,
    agent: agent ?? null,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      streaming: false,
      parts: message.parts.map((part, index) =>
        part.type === "text"
          ? { type: "text" as const, ordinal: index, text: part.text }
          : { type: "tool" as const, tool: toolFromHistory(part.tool) },
      ),
    })),
    tokens: sumTokens(messages),
  };
}

function permissionFromOpenCode(
  permission: OpenCodePermission,
): ChatPermission {
  return {
    id: permission.id,
    action: permission.action,
    resources: [...permission.resources],
    save: [...permission.save],
    message: permission.message,
    toolId: permission.toolId,
    status: permission.status,
  };
}

function mergePermissions(
  current: ChatPermission[],
  incoming: ChatPermission[],
): ChatPermission[] {
  const byId = new Map(current.map((permission) => [permission.id, permission]));
  for (const permission of incoming) {
    byId.set(permission.id, { ...byId.get(permission.id), ...permission });
  }
  return [...byId.values()];
}

export function permissionsLoaded(
  state: ChatState,
  permissions: OpenCodePermission[],
): ChatState {
  if (permissions.length === 0) return state;
  return {
    ...state,
    permissions: mergePermissions(
      state.permissions,
      permissions.map(permissionFromOpenCode),
    ),
  };
}

export function chatPermissionReplied(
  state: ChatState,
  requestId: string,
  decision: "once" | "always" | "reject",
): ChatState {
  return {
    ...state,
    permissions: state.permissions.map((permission) =>
      permission.id === requestId
        ? {
            ...permission,
            status: decision === "reject" ? "rejected" : "allowed",
          }
        : permission,
    ),
  };
}

export function chatPermissionFailed(
  state: ChatState,
  requestId: string,
  message: string,
): ChatState {
  return {
    ...state,
    error: message,
    permissions: state.permissions.map((permission) =>
      permission.id === requestId
        ? { ...permission, status: "pending" }
        : permission,
    ),
  };
}

function formFromOpenCode(form: OpenCodeForm): ChatForm {
  return {
    id: form.id,
    title: form.title,
    kind: form.kind,
    toolId: form.toolId,
    messageId: form.messageId,
    fields: Array.isArray(form.fields) ? form.fields : [],
    status: form.status,
    answer: form.answer ?? null,
    message: form.message ?? null,
  };
}

function mergeForms(current: ChatForm[], incoming: ChatForm[]): ChatForm[] {
  const byId = new Map(current.map((form) => [form.id, form]));
  for (const form of incoming) {
    byId.set(form.id, { ...byId.get(form.id), ...form });
  }
  return [...byId.values()];
}

export function formsLoaded(state: ChatState, forms: OpenCodeForm[]): ChatState {
  if (forms.length === 0) return state;
  return {
    ...state,
    forms: mergeForms(state.forms, forms.map(formFromOpenCode)),
  };
}

export function chatFormAnswered(
  state: ChatState,
  formId: string,
  answer: Record<string, unknown>,
): ChatState {
  return {
    ...state,
    forms: state.forms.map((form) =>
      form.id === formId ? { ...form, status: "answered", answer } : form,
    ),
  };
}

export function chatFormFailed(
  state: ChatState,
  formId: string,
  message: string,
): ChatState {
  return {
    ...state,
    error: message,
    forms: state.forms.map((form) =>
      form.id === formId ? { ...form, status: "pending", answer: null } : form,
    ),
  };
}

export function chatFailed(state: ChatState, message: string): ChatState {
  return {
    ...state,
    status: "error",
    streaming: false,
    error: message,
  };
}

export function chatStopped(): ChatState {
  return { ...initialChatState };
}

export function clearChatError(state: ChatState): ChatState {
  return { ...state, error: "" };
}

export function appendUserMessage(state: ChatState, text: string): ChatState {
  const message: ChatMessage = {
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "user",
    parts: [{ type: "text", ordinal: 0, text }],
  };
  return {
    ...state,
    messages: [...state.messages, message],
    streaming: true,
    error: "",
  };
}

export function chatSendFailed(state: ChatState, message: string): ChatState {
  return {
    ...state,
    streaming: false,
    error: message,
  };
}

function dataOf(event: OpenCodeEvent): Record<string, unknown> {
  return event.data ?? {};
}

function textOf(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberOf(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function assistantIDOf(state: ChatState, data: Record<string, unknown>): string {
  return textOf(data.assistantMessageID) || `assistant-${state.messages.length}`;
}

function findOrCreateAssistant(
  state: ChatState,
  assistantID: string,
): { state: ChatState; index: number } {
  const id = `assistant:${assistantID}`;
  const existing = state.messages.findIndex((message) => message.id === id);
  if (existing !== -1) {
    return { state, index: existing };
  }
  const message: ChatMessage = {
    id,
    role: "assistant",
    parts: [],
    streaming: true,
  };
  return {
    state: { ...state, messages: [...state.messages, message] },
    index: state.messages.length,
  };
}

function replaceMessage(
  state: ChatState,
  index: number,
  message: ChatMessage,
): ChatState {
  const messages = state.messages.map((current, position) =>
    position === index ? message : current,
  );
  return { ...state, messages };
}

type TextMode = "started" | "delta" | "ended";

function upsertTextPart(
  state: ChatState,
  data: Record<string, unknown>,
  mode: TextMode,
  text: string,
): ChatState {
  const assistantID = assistantIDOf(state, data);
  const ordinal = numberOf(data.ordinal);
  const located = findOrCreateAssistant(state, assistantID);
  const message = located.state.messages[located.index];
  const partIndex = message.parts.findIndex(
    (part) => part.type === "text" && part.ordinal === ordinal,
  );

  let parts: ChatPart[];
  if (partIndex === -1) {
    if (mode === "ended" && text.length === 0) {
      return located.state;
    }
    parts = [...message.parts, { type: "text", ordinal, text }];
  } else {
    parts = message.parts.map((part, index) => {
      if (index !== partIndex || part.type !== "text") return part;
      return {
        ...part,
        text: mode === "delta" ? `${part.text}${text}` : text || part.text,
      };
    });
  }

  return replaceMessage(located.state, located.index, {
    ...message,
    parts,
    streaming: mode !== "ended",
  });
}

function toolFromEvent(data: Record<string, unknown>): ChatToolCall | null {
  const raw = data.tool;
  if (!raw || typeof raw !== "object") return null;
  const tool = raw as Partial<OpenCodeToolCall>;
  if (!textOf(tool.id)) return null;
  return {
    id: textOf(tool.id),
    name: textOf(tool.name),
    status:
      tool.status === "running" ||
      tool.status === "completed" ||
      tool.status === "error" ||
      tool.status === "streaming"
        ? tool.status
        : "running",
    input: tool.input ?? null,
    output: textOf(tool.output),
    error: textOf(tool.error),
    executed: Boolean(tool.executed),
    files: Array.isArray(tool.files)
      ? tool.files.filter((file): file is string => typeof file === "string")
      : [],
  };
}

function upsertToolPart(
  state: ChatState,
  data: Record<string, unknown>,
): ChatState {
  const incoming = toolFromEvent(data);
  if (!incoming) return state;
  const assistantID = assistantIDOf(state, data);
  const located = findOrCreateAssistant(state, assistantID);
  const message = located.state.messages[located.index];
  const toolIndex = message.parts.findIndex(
    (part) => part.type === "tool" && part.tool.id === incoming.id,
  );

  let parts: ChatPart[];
  if (toolIndex === -1) {
    parts = [...message.parts, { type: "tool", tool: incoming }];
  } else {
    parts = message.parts.map((part, index) => {
      if (index !== toolIndex || part.type !== "tool") return part;
      return {
        type: "tool",
        tool: {
          ...part.tool,
          ...incoming,
          name: incoming.name || part.tool.name,
          input:
            incoming.input === null || incoming.input === undefined
              ? part.tool.input
              : incoming.input,
          output: incoming.output || part.tool.output,
          error: incoming.error || part.tool.error,
          executed: incoming.executed || part.tool.executed,
          files: incoming.files.length > 0 ? incoming.files : part.tool.files,
        },
      };
    });
  }

  return replaceMessage(located.state, located.index, {
    ...message,
    parts,
    streaming: incoming.status === "streaming" || incoming.status === "running",
  });
}

function upsertPermission(
  state: ChatState,
  data: Record<string, unknown>,
): ChatState {
  const raw = data.permission;
  if (!raw || typeof raw !== "object") return state;
  const permission = permissionFromOpenCode(raw as OpenCodePermission);
  return {
    ...state,
    permissions: mergePermissions(state.permissions, [permission]),
  };
}

function applyPermissionReply(
  state: ChatState,
  data: Record<string, unknown>,
): ChatState {
  const raw = data.permissionReply;
  if (!raw || typeof raw !== "object") return state;
  const reply = raw as Record<string, unknown>;
  const requestId = textOf(reply.requestId);
  if (!requestId) return state;
  return {
    ...state,
    permissions: state.permissions.map((permission) =>
      permission.id === requestId
        ? {
            ...permission,
            status:
              textOf(reply.status) === "rejected" ? "rejected" : "allowed",
          }
        : permission,
    ),
  };
}

function upsertForm(state: ChatState, data: Record<string, unknown>): ChatState {
  const raw = data.form;
  if (!raw || typeof raw !== "object") return state;
  const form = formFromOpenCode(raw as OpenCodeForm);
  return {
    ...state,
    forms: mergeForms(state.forms, [form]),
  };
}

function applyFormReply(
  state: ChatState,
  data: Record<string, unknown>,
): ChatState {
  const raw = data.formReply;
  if (!raw || typeof raw !== "object") return state;
  const reply = raw as Record<string, unknown>;
  const formId = textOf(reply.id);
  if (!formId) return state;
  const status = textOf(reply.status);
  const answer =
    reply.answer && typeof reply.answer === "object"
      ? (reply.answer as Record<string, unknown>)
      : null;
  return {
    ...state,
    forms: state.forms.map((form) =>
      form.id === formId
        ? formFromOpenCode({
            ...form,
            sessionId: "",
            status:
              status === "cancelled"
                ? "cancelled"
                : status === "answered"
                  ? "answered"
                  : form.status,
            answer: answer ?? form.answer,
          })
        : form,
    ),
  };
}

function markAllMessagesIdle(state: ChatState): ChatMessage[] {
  return state.messages.map((message) =>
    message.streaming ? { ...message, streaming: false } : message,
  );
}

function tokensFrom(data: Record<string, unknown>): ChatTokens | null {
  const raw = data.tokens;
  if (!raw || typeof raw !== "object") return null;
  const tokens = raw as Record<string, unknown>;
  const cache =
    tokens.cache && typeof tokens.cache === "object"
      ? (tokens.cache as Record<string, unknown>)
      : {};
  return {
    input: numberOf(tokens.input),
    output: numberOf(tokens.output),
    reasoning: numberOf(tokens.reasoning),
    cacheRead: numberOf(cache.read),
    cacheWrite: numberOf(cache.write),
  };
}

function eventError(data: Record<string, unknown>): string {
  const error = data.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const message = textOf(record.message);
    if (message) return message;
    const type = textOf(record.type);
    if (type) return type;
  }
  return "OpenCode no pudo completar la respuesta.";
}

/**
 * Applies one OpenCode SSE event to the chat state. Tool and permission events
 * arrive with a normalized `data.tool` / `data.permission` object added by the
 * Rust bridge; unknown event types are ignored.
 */
export function applyOpenCodeEvent(
  state: ChatState,
  event: OpenCodeEvent,
): ChatState {
  const data = dataOf(event);
  const eventSession = textOf(data.sessionID);
  if (eventSession && state.sessionId && eventSession !== state.sessionId) {
    return state;
  }

  switch (event.type) {
    case "session.execution.started":
      return { ...state, streaming: true, error: "" };

    case "session.step.started": {
      const model = data.model;
      const agent = textOf(data.agent) || state.agent;
      if (model && typeof model === "object") {
        const record = model as Record<string, unknown>;
        const provider = textOf(record.providerID);
        const id = textOf(record.id);
        if (provider && id) {
          const base = `${provider}/${id}`;
          const variant = state.model?.startsWith(`${base}#`)
            ? state.model.slice(base.length)
            : "";
          return {
            ...state,
            streaming: true,
            model: `${base}${variant}`,
            agent,
          };
        }
      }
      return { ...state, streaming: true, agent };
    }

    case "session.agent.selected": {
      const agent = textOf(data.agent) || textOf(data.agentID);
      return agent ? { ...state, agent } : state;
    }

    case "session.model.selected": {
      const model = data.model;
      if (model && typeof model === "object") {
        const record = model as Record<string, unknown>;
        const provider = textOf(record.providerID);
        const id = textOf(record.id);
        if (provider && id) {
          const variant = textOf(record.variant);
          return {
            ...state,
            model: `${provider}/${id}${variant ? `#${variant}` : ""}`,
          };
        }
      }
      return state;
    }

    case "session.text.started":
      return upsertTextPart(state, data, "started", "");

    case "session.text.delta":
      return upsertTextPart(state, data, "delta", textOf(data.delta));

    case "session.text.ended":
      return upsertTextPart(state, data, "ended", textOf(data.text));

    case "session.tool.input.started":
    case "session.tool.input.ended":
    case "session.tool.called":
    case "session.tool.success":
    case "session.tool.failed":
      return upsertToolPart(state, data);

    case "permission.asked":
      return upsertPermission(state, data);

    case "permission.replied":
      return applyPermissionReply(state, data);

    case "form.created":
      return upsertForm(state, data);

    case "form.replied":
    case "form.cancelled":
      return applyFormReply(state, data);

    case "session.usage.updated": {
      const tokens = tokensFrom(data);
      return tokens ? { ...state, tokens } : state;
    }

    case "session.step.ended": {
      const tokens = tokensFrom(data);
      return {
        ...state,
        tokens: tokens ?? state.tokens,
      };
    }

    case "session.execution.succeeded":
    case "session.execution.interrupted":
      return {
        ...state,
        streaming: false,
        messages: markAllMessagesIdle(state),
      };

    case "session.execution.failed": {
      if (!state.streaming) {
        return { ...state, messages: markAllMessagesIdle(state) };
      }
      const message = eventError(data);
      return {
        ...state,
        streaming: false,
        error: message,
        messages: markAllMessagesIdle(state),
      };
    }

    case "client.stream_error":
      return {
        ...state,
        status: "error",
        streaming: false,
        error: textOf(data.message) || "Se perdió la conexión con OpenCode.",
        messages: markAllMessagesIdle(state),
      };

    default:
      return state;
  }
}
