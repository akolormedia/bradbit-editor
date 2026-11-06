import { OpenCodeChatMessage, OpenCodeEvent, OpenCodeSession } from "../types";

export type ChatStatus = "idle" | "starting" | "ready" | "error";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  streaming?: boolean;
  error?: boolean;
}

export interface ChatTokens {
  input: number;
  output: number;
  reasoning: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface ChatState {
  status: ChatStatus;
  sessionId: string | null;
  title: string;
  model: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  error: string;
  tokens: ChatTokens | null;
}

export const initialChatState: ChatState = {
  status: "idle",
  sessionId: null,
  title: "",
  model: null,
  messages: [],
  streaming: false,
  error: "",
  tokens: null,
};

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
    error: "",
  };
}

export function chatFromHistory(
  session: OpenCodeSession,
  messages: OpenCodeChatMessage[],
): ChatState {
  const state = chatStarted(chatStarting(initialChatState), session);
  return {
    ...state,
    messages: messages.map((message) => ({
      id: message.id,
      role: message.role,
      text: message.text,
    })),
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
    text,
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

function messageKey(data: Record<string, unknown>, fallback: string): string {
  const assistantID = textOf(data.assistantMessageID);
  const ordinal = numberOf(data.ordinal);
  return assistantID ? `${assistantID}:${ordinal}` : fallback;
}

function upsertAssistantMessage(
  state: ChatState,
  data: Record<string, unknown>,
  delta?: string,
  finalText?: string,
  streaming = true,
): ChatState {
  const id = `assistant:${messageKey(data, `assistant-${state.messages.length}`)}`;
  const existingIndex = state.messages.findIndex((message) => message.id === id);
  if (existingIndex === -1) {
    const message: ChatMessage = {
      id,
      role: "assistant",
      text: finalText ?? delta ?? "",
      streaming,
    };
    return { ...state, messages: [...state.messages, message] };
  }
  const messages = state.messages.map((message, index) => {
    if (index !== existingIndex) return message;
    return {
      ...message,
      text: finalText ?? `${message.text}${delta ?? ""}`,
      streaming,
    };
  });
  return { ...state, messages };
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
 * Applies one OpenCode SSE event to the chat state. Unknown event types are
 * ignored so new server features never break the current UI.
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
      if (model && typeof model === "object") {
        const record = model as Record<string, unknown>;
        const provider = textOf(record.providerID);
        const id = textOf(record.id);
        if (provider && id) {
          return {
            ...state,
            streaming: true,
            model: `${provider}/${id}`,
          };
        }
      }
      return { ...state, streaming: true };
    }

    case "session.text.started":
      return upsertAssistantMessage(state, data);

    case "session.text.delta":
      return upsertAssistantMessage(
        state,
        data,
        textOf(data.delta),
        undefined,
        true,
      );

    case "session.text.ended":
      return upsertAssistantMessage(
        state,
        data,
        undefined,
        textOf(data.text),
        false,
      );

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
