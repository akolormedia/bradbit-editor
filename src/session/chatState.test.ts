import { describe, expect, it } from "vitest";
import {
  appendUserMessage,
  applyOpenCodeEvent,
  chatFailed,
  chatSendFailed,
  chatStarted,
  chatStarting,
  clearChatError,
  initialChatState,
} from "./chatState";

const session = { id: "ses_test", title: "Bradbit" };

function ready() {
  return chatStarted(chatStarting(initialChatState), session);
}

describe("chat state (T-2.1.1)", () => {
  it("walks through starting, ready and error states", () => {
    expect(chatStarting(initialChatState).status).toBe("starting");
    const connected = chatStarted(chatStarting(initialChatState), session);
    expect(connected.status).toBe("ready");
    expect(connected.sessionId).toBe("ses_test");
    expect(chatFailed(connected, "sin binario").status).toBe("error");
    expect(chatFailed(connected, "sin binario").error).toBe("sin binario");
    expect(clearChatError(chatFailed(connected, "x")).error).toBe("");
  });

  it("streams text deltas into one assistant message", () => {
    let state = appendUserMessage(ready(), "Hola");
    expect(state.messages).toHaveLength(1);
    expect(state.streaming).toBe(true);

    state = applyOpenCodeEvent(state, {
      type: "session.text.started",
      data: { sessionID: "ses_test", assistantMessageID: "msg_a", ordinal: 0 },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.text.delta",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "ok",
      },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.text.ended",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_a",
        ordinal: 0,
        text: "ok",
      },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.execution.succeeded",
      data: { sessionID: "ses_test" },
    });

    expect(state.messages).toHaveLength(2);
    expect(state.messages[1].role).toBe("assistant");
    expect(state.messages[1].text).toBe("ok");
    expect(state.messages[1].streaming).toBe(false);
    expect(state.streaming).toBe(false);
  });

  it("keeps separate assistant blocks by message and ordinal", () => {
    let state = appendUserMessage(ready(), "Dos bloques");
    state = applyOpenCodeEvent(state, {
      type: "session.text.delta",
      data: { sessionID: "ses_test", assistantMessageID: "msg_a", ordinal: 0, delta: "uno" },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.text.delta",
      data: { sessionID: "ses_test", assistantMessageID: "msg_a", ordinal: 1, delta: "dos" },
    });
    const assistants = state.messages.filter((message) => message.role === "assistant");
    expect(assistants).toHaveLength(2);
    expect(assistants[0].text).toBe("uno");
    expect(assistants[1].text).toBe("dos");
  });

  it("ignores events from other sessions", () => {
    let state = appendUserMessage(ready(), "Hola");
    const before = state;
    state = applyOpenCodeEvent(state, {
      type: "session.text.delta",
      data: { sessionID: "ses_other", delta: "no" },
    });
    expect(state).toBe(before);
  });

  it("stores usage tokens and model metadata", () => {
    let state = ready();
    state = applyOpenCodeEvent(state, {
      type: "session.step.started",
      data: {
        sessionID: "ses_test",
        model: { id: "hy4", providerID: "opencode-go" },
      },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.usage.updated",
      data: {
        sessionID: "ses_test",
        tokens: {
          input: 12,
          output: 3,
          reasoning: 2,
          cache: { read: 7, write: 1 },
        },
      },
    });
    expect(state.model).toBe("opencode-go/hy4");
    expect(state.tokens).toEqual({
      input: 12,
      output: 3,
      reasoning: 2,
      cacheRead: 7,
      cacheWrite: 1,
    });
  });

  it("surfaces execution errors but ignores a failure after the user stops", () => {
    let state = appendUserMessage(ready(), "Hola");
    state = applyOpenCodeEvent(state, {
      type: "session.execution.failed",
      data: {
        sessionID: "ses_test",
        error: { type: "provider.no-route", message: "Sin ruta" },
      },
    });
    expect(state.streaming).toBe(false);
    expect(state.error).toBe("Sin ruta");

    let stopped = appendUserMessage(ready(), "Otra");
    stopped = { ...stopped, streaming: false };
    stopped = applyOpenCodeEvent(stopped, {
      type: "session.execution.failed",
      data: {
        sessionID: "ses_test",
        error: { type: "aborted", message: "aborted" },
      },
    });
    expect(stopped.error).toBe("");
  });

  it("marks a stream failure as a connection error", () => {
    const state = applyOpenCodeEvent(appendUserMessage(ready(), "Hola"), {
      type: "client.stream_error",
      data: { message: "conexión cerrada" },
    });
    expect(state.status).toBe("error");
    expect(state.streaming).toBe(false);
    expect(state.error).toBe("conexión cerrada");
    expect(state.messages.every((message) => !message.streaming)).toBe(true);
  });

  it("records send failures without losing the user message", () => {
    let state = appendUserMessage(ready(), "Hola");
    state = chatSendFailed(state, "HTTP 500");
    expect(state.streaming).toBe(false);
    expect(state.error).toBe("HTTP 500");
    expect(state.messages[0].text).toBe("Hola");
  });
});
