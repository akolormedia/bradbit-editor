import { describe, expect, it } from "vitest";
import {
  appendUserMessage,
  applyOpenCodeEvent,
  chatFailed,
  chatFormAnswered,
  chatFormFailed,
  chatFromHistory,
  chatPermissionFailed,
  chatPermissionReplied,
  chatSendFailed,
  chatStarted,
  chatStarting,
  clearChatError,
  formsLoaded,
  initialChatState,
  messageText,
  permissionsLoaded,
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

  it("hydrates a session from persisted OpenCode history", () => {
    const state = chatFromHistory(session, [
      {
        id: "msg_user",
        role: "user",
        text: "Hola",
        parts: [{ type: "text", text: "Hola" }],
      },
      {
        id: "msg_assistant",
        role: "assistant",
        text: "ok",
        model: "opencode-go/hy4",
        tokens: {
          input: 10,
          output: 4,
          reasoning: 2,
          cacheRead: 7,
          cacheWrite: 1,
        },
        parts: [
          { type: "text", text: "ok" },
          {
            type: "tool",
            tool: {
              id: "tool_1",
              name: "read",
              status: "completed",
              input: { path: "notas.md" },
              output: "Hola",
              error: "",
              executed: false,
              files: ["notas.md"],
            },
          },
        ],
      },
    ]);
    expect(state.status).toBe("ready");
    expect(state.sessionId).toBe("ses_test");
    expect(state.streaming).toBe(false);
    expect(state.model).toBe("opencode-go/hy4");
    expect(state.messages.map(messageText)).toEqual(["Hola", "ok"]);
    expect(state.messages[1].parts[1]).toMatchObject({
      type: "tool",
      tool: { name: "read", files: ["notas.md"] },
    });
    expect(state.tokens).toEqual({
      input: 10,
      output: 4,
      reasoning: 2,
      cacheRead: 7,
      cacheWrite: 1,
    });
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
    expect(messageText(state.messages[1])).toBe("ok");
    expect(state.messages[1].streaming).toBe(false);
    expect(state.streaming).toBe(false);
  });

  it("keeps multiple text blocks as ordered parts of one assistant message", () => {
    let state = appendUserMessage(ready(), "Dos bloques");
    state = applyOpenCodeEvent(state, {
      type: "session.text.delta",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_a",
        ordinal: 0,
        delta: "uno",
      },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.text.delta",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_a",
        ordinal: 1,
        delta: "dos",
      },
    });
    const assistants = state.messages.filter(
      (message) => message.role === "assistant",
    );
    expect(assistants).toHaveLength(1);
    expect(assistants[0].parts).toEqual([
      { type: "text", ordinal: 0, text: "uno" },
      { type: "text", ordinal: 1, text: "dos" },
    ]);
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
    expect(messageText(state.messages[0])).toBe("Hola");
  });
});

describe("chat tools and permissions (T-2.1.3)", () => {
  it("attaches normalized tool events to the assistant message", () => {
    let state = appendUserMessage(ready(), "Lee el archivo");
    state = applyOpenCodeEvent(state, {
      type: "session.tool.input.started",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_a",
        tool: {
          id: "tool_1",
          name: "read",
          status: "streaming",
          input: null,
          output: "",
          error: "",
          executed: false,
          files: [],
        },
      },
    });
    state = applyOpenCodeEvent(state, {
      type: "session.tool.success",
      data: {
        sessionID: "ses_test",
        assistantMessageID: "msg_a",
        tool: {
          id: "tool_1",
          name: "read",
          status: "completed",
          input: { path: "notas.md" },
          output: "Hola",
          error: "",
          executed: false,
          files: ["notas.md"],
        },
      },
    });

    const assistant = state.messages.find(
      (message) => message.role === "assistant",
    )!;
    expect(assistant.parts).toHaveLength(1);
    expect(assistant.parts[0]).toMatchObject({
      type: "tool",
      tool: {
        id: "tool_1",
        name: "read",
        status: "completed",
        output: "Hola",
        files: ["notas.md"],
      },
    });
  });

  it("adds pending permissions, answers them and can roll back", () => {
    let state = ready();
    state = applyOpenCodeEvent(state, {
      type: "permission.asked",
      data: {
        sessionID: "ses_test",
        permission: {
          id: "per_1",
          sessionId: "ses_test",
          action: "edit",
          resources: ["notas.md"],
          save: ["*"],
          message: "",
          toolId: "tool_1",
          status: "pending",
        },
      },
    });
    expect(state.permissions).toEqual([
      {
        id: "per_1",
        action: "edit",
        resources: ["notas.md"],
        save: ["*"],
        message: "",
        toolId: "tool_1",
        status: "pending",
      },
    ]);

    state = chatPermissionReplied(state, "per_1", "once");
    expect(state.permissions[0].status).toBe("allowed");

    state = chatPermissionFailed(state, "per_1", "no se pudo responder");
    expect(state.permissions[0].status).toBe("pending");
    expect(state.error).toBe("no se pudo responder");
  });

  it("loads pending permissions when restoring a session", () => {
    const state = permissionsLoaded(ready(), [
      {
        id: "per_1",
        sessionId: "ses_test",
        action: "read",
        resources: ["notas.md"],
        save: ["*"],
        message: "",
        toolId: "tool_1",
        status: "pending",
      },
    ]);
    expect(state.permissions).toHaveLength(1);
    expect(state.permissions[0].action).toBe("read");
  });

  it("marks tools as answered when the server confirms a permission reply", () => {
    let state = ready();
    state = applyOpenCodeEvent(state, {
      type: "permission.asked",
      data: {
        sessionID: "ses_test",
        permission: {
          id: "per_1",
          sessionId: "ses_test",
          action: "read",
          resources: ["notas.md"],
          save: ["*"],
          message: "",
          toolId: "tool_1",
          status: "pending",
        },
      },
    });
    state = applyOpenCodeEvent(state, {
      type: "permission.replied",
      data: {
        sessionID: "ses_test",
        permissionReply: {
          requestId: "per_1",
          sessionId: "ses_test",
          reply: "reject",
          status: "rejected",
        },
      },
    });
    expect(state.permissions[0].status).toBe("rejected");
  });
});

describe("chat forms and questions (T-2.1.4)", () => {
  const form = {
    id: "frm_1",
    sessionId: "ses_test",
    title: "Questions",
    kind: "question",
    toolId: "tool_q",
    messageId: "msg_q",
    status: "pending" as const,
    fields: [
      {
        key: "q0",
        title: "Color favorito",
        description: "¿Cuál prefieres?",
        type: "string" as const,
        options: [
          { value: "Rojo", label: "Rojo" },
          { value: "Azul", label: "Azul" },
        ],
        custom: true,
      },
    ],
  };

  it("adds a pending form and marks it answered when OpenCode replies", () => {
    let state = applyOpenCodeEvent(ready(), {
      type: "form.created",
      data: { sessionID: "ses_test", form },
    });
    expect(state.forms).toHaveLength(1);
    expect(state.forms[0].status).toBe("pending");

    state = applyOpenCodeEvent(state, {
      type: "form.replied",
      data: {
        sessionID: "ses_test",
        formReply: {
          id: "frm_1",
          sessionId: "ses_test",
          status: "answered",
          answer: { q0: "Rojo" },
        },
      },
    });
    expect(state.forms[0].status).toBe("answered");
    expect(state.forms[0].answer).toEqual({ q0: "Rojo" });
  });

  it("marks a form as cancelled and can load pending forms", () => {
    let state = formsLoaded(ready(), [form]);
    expect(state.forms).toHaveLength(1);

    state = applyOpenCodeEvent(state, {
      type: "form.cancelled",
      data: {
        sessionID: "ses_test",
        formReply: {
          id: "frm_1",
          sessionId: "ses_test",
          status: "cancelled",
        },
      },
    });
    expect(state.forms[0].status).toBe("cancelled");
  });

  it("optimistically answers and rolls back on failure", () => {
    let state = formsLoaded(ready(), [form]);
    state = chatFormAnswered(state, "frm_1", { q0: "Azul" });
    expect(state.forms[0].status).toBe("answered");
    state = chatFormFailed(state, "frm_1", "sin conexión");
    expect(state.forms[0].status).toBe("pending");
    expect(state.forms[0].answer).toBeNull();
    expect(state.error).toBe("sin conexión");
  });
});
