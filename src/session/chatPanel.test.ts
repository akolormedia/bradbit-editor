// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ChatPanel, ChatPanelOptions } from "./chatPanel";
import { appendUserMessage, chatStarted, chatStarting, initialChatState } from "./chatState";

function options(overrides: Partial<ChatPanelOptions> = {}): ChatPanelOptions {
  return {
    language: "es",
    projectName: "mi-guion",
    projectRoot: "/proyecto",
    sessions: [
      { id: "ses_test", title: "Sesión 1", streaming: false, error: false },
    ],
    activeSessionId: "ses_test",
    canCreateSession: true,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onRetry: vi.fn(),
    onSelectSession: vi.fn(),
    onCreateSession: vi.fn(),
    onCloseSession: vi.fn(),
    onOpenToolFile: vi.fn(),
    onPermissionReply: vi.fn(),
    onFormReply: vi.fn(),
    kit: { agents: [], commands: [], skills: [] },
    models: [],
    projectFiles: [],
    onAgentChange: vi.fn(),
    onModelChange: vi.fn(),
    ...overrides,
  };
}

function readyState() {
  return chatStarted(chatStarting(initialChatState), {
    id: "ses_test",
    title: "Bradbit",
  });
}

describe("chat panel (T-2.1.1)", () => {
  it("shows the empty state and connection status", () => {
    const panel = new ChatPanel(options());
    expect(panel.element.textContent).toContain("Habla con tu agente");
    expect(panel.element.textContent).toContain("Sin sesión");
    expect(panel.element.querySelector('[data-testid="chat-input"]')).not.toBeNull();
  });

  it("sends the composer text with the send button and Enter", () => {
    const onSend = vi.fn();
    const panel = new ChatPanel(options({ onSend }));
    panel.update(readyState());

    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    const send = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="chat-send"]',
    )!;
    input.value = "Escribe una escena";
    input.dispatchEvent(new Event("input"));
    expect(send.disabled).toBe(false);

    send.click();
    expect(onSend).toHaveBeenCalledWith("Escribe una escena");

    onSend.mockClear();
    input.value = "Otra idea";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onSend).toHaveBeenCalledWith("Otra idea");

    onSend.mockClear();
    input.value = "con salto";
    input.dispatchEvent(new Event("input"));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", shiftKey: true }),
    );
    expect(onSend).not.toHaveBeenCalled();
  });

  it("switches to Stop while streaming and never loses the draft on updates", () => {
    const onStop = vi.fn();
    const panel = new ChatPanel(options({ onStop }));
    const streaming = appendUserMessage(readyState(), "Hola");
    panel.update(streaming);

    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    input.value = "borrador";
    panel.update({ ...streaming, streaming: true });
    expect(input.value).toBe("borrador");

    const stop = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="chat-stop"]',
    )!;
    expect(stop.hidden).toBe(false);
    expect(
      panel.element.querySelector<HTMLButtonElement>('[data-testid="chat-send"]')!
        .hidden,
    ).toBe(true);
    stop.click();
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("renders user and assistant messages, errors and the retry action", () => {
    const onRetry = vi.fn();
    const panel = new ChatPanel(options({ onRetry }));
    let state = appendUserMessage(readyState(), "Hola");
    state = {
      ...state,
      messages: [
        ...state.messages,
        {
          id: "assistant:msg_a",
          role: "assistant",
          parts: [
            {
              type: "text",
              ordinal: 0,
              text: "Hola, ¿en qué trabajamos?",
            },
          ],
        },
      ],
      streaming: false,
      error: "Sin ruta al modelo",
    };
    panel.update(state);

    expect(panel.element.textContent).toContain("Tú");
    expect(panel.element.textContent).toContain("Agente");
    expect(panel.element.textContent).toContain("Hola, ¿en qué trabajamos?");
    expect(panel.element.textContent).toContain("Sin ruta al modelo");
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="chat-retry"]')
      ?.click();
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders session tabs, creates and switches sessions (T-2.1.2)", () => {
    const onSelectSession = vi.fn();
    const onCreateSession = vi.fn();
    const panel = new ChatPanel(
      options({
        sessions: [
          { id: "ses_a", title: "Sesión 1", streaming: false, error: false },
          { id: "ses_b", title: "Sesión 2", streaming: false, error: false },
        ],
        activeSessionId: "ses_a",
        onSelectSession,
        onCreateSession,
      }),
    );

    expect(panel.element.textContent).toContain("Sesión 1");
    expect(panel.element.textContent).toContain("Sesión 2");
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="session-tab-ses_b"]')
      ?.click();
    expect(onSelectSession).toHaveBeenCalledWith("ses_b");
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="session-new"]')
      ?.click();
    expect(onCreateSession).toHaveBeenCalledOnce();
  });

  it("closes a non-last session and keeps drafts per tab", () => {
    const onCloseSession = vi.fn();
    const panel = new ChatPanel(
      options({
        sessions: [
          { id: "ses_a", title: "Sesión 1", streaming: false, error: false },
          { id: "ses_b", title: "Sesión 2", streaming: false, error: false },
        ],
        activeSessionId: "ses_a",
        onCloseSession,
      }),
    );
    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    input.value = "borrador A";
    input.dispatchEvent(new Event("input"));

    panel.update(readyState(), {
      activeSessionId: "ses_b",
      sessions: [
        { id: "ses_a", title: "Sesión 1", streaming: false, error: false },
        { id: "ses_b", title: "Sesión 2", streaming: false, error: false },
      ],
    });
    expect(input.value).toBe("");
    input.value = "borrador B";
    input.dispatchEvent(new Event("input"));

    panel.update(readyState(), {
      activeSessionId: "ses_a",
      sessions: [
        { id: "ses_a", title: "Sesión 1", streaming: false, error: false },
        { id: "ses_b", title: "Sesión 2", streaming: false, error: false },
      ],
    });
    expect(input.value).toBe("borrador A");

    panel.element
      .querySelector<HTMLElement>('[data-testid="session-close-ses_b"]')
      ?.click();
    expect(onCloseSession).toHaveBeenCalledWith("ses_b");
  });

  it("renders tool calls, opens files and shows diffs for edits (T-2.1.3)", () => {
    const onOpenToolFile = vi.fn();
    const panel = new ChatPanel(options({ onOpenToolFile }));
    const state = readyState();
    panel.update({
      ...state,
      messages: [
        {
          id: "assistant:msg_a",
          role: "assistant",
          parts: [
            {
              type: "text",
              ordinal: 0,
              text: "Voy a editarlo.",
            },
            {
              type: "tool",
              tool: {
                id: "tool_1",
                name: "edit",
                status: "completed",
                input: { path: "notas.md" },
                output: "Editado",
                error: "",
                executed: true,
                files: ["/proyecto/notas.md"],
              },
            },
          ],
        },
      ],
    });

    expect(panel.element.textContent).toContain("Editó notas.md");
    expect(panel.element.textContent).not.toContain("/proyecto/notas.md");
    const toggle = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="tool-toggle-tool_1"]',
    )!;
    toggle.click();
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel.element.textContent).toContain("Resultado");

    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="tool-file-tool_1-0"]')
      ?.click();
    expect(onOpenToolFile).toHaveBeenCalledWith(
      "/proyecto/notas.md",
      true,
    );
  });

  it("renders permission cards and sends allow/reject decisions (T-2.1.3)", () => {
    const onPermissionReply = vi.fn();
    const panel = new ChatPanel(options({ onPermissionReply }));
    panel.update({
      ...readyState(),
      permissions: [
        {
          id: "per_1",
          action: "edit",
          resources: ["notas.md"],
          save: ["*"],
          message: "",
          toolId: "tool_1",
          status: "pending",
        },
      ],
    });

    expect(panel.element.textContent).toContain("OpenCode solicita permiso");
    expect(panel.element.textContent).toContain("edit · notas.md");
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="permission-always-per_1"]')
      ?.click();
    expect(onPermissionReply).toHaveBeenCalledWith("per_1", "always");

    panel.update({
      ...readyState(),
      permissions: [
        {
          id: "per_1",
          action: "edit",
          resources: ["notas.md"],
          save: ["*"],
          message: "",
          toolId: "tool_1",
          status: "allowed",
        },
      ],
    });
    expect(
      panel.element.querySelector('[data-testid="permission-per_1"]'),
    ).toBeNull();
  });

  it("shows context usage in the header (T-2.1.3)", () => {
    const panel = new ChatPanel(options());
    panel.update({
      ...readyState(),
      tokens: {
        input: 1200,
        output: 300,
        reasoning: 100,
        cacheRead: 800,
        cacheWrite: 0,
      },
    });
    const context = panel.element.querySelector<HTMLElement>(
      ".session-context",
    )!;
    expect(context.hidden).toBe(false);
    expect(context.textContent).toContain("2.0k");
    expect(context.textContent).toContain("contexto");
    expect(context.title).toContain("Entrada 1.2k");
  });

  it("renders question forms, validates them and sends all answers (T-2.1.4)", () => {
    const onFormReply = vi.fn();
    const panel = new ChatPanel(options({ onFormReply }));
    panel.update({
      ...readyState(),
      forms: [
        {
          id: "frm_1",
          title: "Questions",
          kind: "question",
          toolId: "tool_q",
          messageId: "msg_q",
          status: "pending",
          answer: null,
          message: null,
          fields: [
            {
              key: "q0",
              title: "Color favorito",
              description: "¿Cuál prefieres?",
              type: "string",
              required: true,
              options: [
                { value: "Rojo", label: "Rojo" },
                { value: "Azul", label: "Azul" },
              ],
              custom: true,
            },
            {
              key: "q1",
              title: "¿Continuar?",
              type: "boolean",
            },
          ],
        },
      ],
    });

    expect(panel.element.textContent).toContain("El agente tiene una pregunta");
    expect(panel.element.textContent).toContain("Color favorito");
    expect(panel.element.textContent).toContain("¿Continuar?");

    const submit = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="form-submit-frm_1"]',
    )!;
    expect(submit.disabled).toBe(true);

    const azul = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="form-input-frm_1-q0-Azul"]',
    )!;
    azul.checked = true;
    azul.dispatchEvent(new Event("change"));
    expect(submit.disabled).toBe(false);
    const continueInput = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="form-input-frm_1-q1"]',
    )!;
    continueInput.checked = true;
    continueInput.dispatchEvent(new Event("change"));

    submit.click();
    expect(onFormReply).toHaveBeenCalledWith("frm_1", {
      q0: "Azul",
      q1: true,
    });
  });

  it("accepts a free-text answer and shows answered forms", () => {
    const onFormReply = vi.fn();
    const panel = new ChatPanel(options({ onFormReply }));
    const baseForm = {
      id: "frm_1",
      title: "Questions",
      kind: "question",
      toolId: null,
      messageId: null,
      status: "pending" as const,
      answer: null,
      message: null,
      fields: [
        {
          key: "q0",
          title: "Color favorito",
          type: "string" as const,
          required: true,
          options: [{ value: "Rojo", label: "Rojo" }],
          custom: true,
        },
      ],
    };
    panel.update({ ...readyState(), forms: [baseForm] });

    const custom = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="form-input-frm_1-q0-custom"]',
    )!;
    custom.value = "Verde";
    custom.dispatchEvent(new Event("input"));
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="form-submit-frm_1"]')
      ?.click();
    expect(onFormReply).toHaveBeenCalledWith("frm_1", { q0: "Verde" });

    panel.update({
      ...readyState(),
      forms: [
        {
          ...baseForm,
          status: "answered",
          answer: { q0: "Rojo" },
        },
      ],
    });
    expect(panel.element.textContent).toContain("Respondida");
    expect(panel.element.textContent).toContain("Color favorito: Rojo");
  });

  it("shows kit agents and model variants and reports changes (T-2.2.2)", () => {
    const onAgentChange = vi.fn();
    const onModelChange = vi.fn();
    const panel = new ChatPanel(
      options({
        kit: {
          agents: [
            {
              id: "guionista",
              name: "guionista",
              description: "Escribe",
              path: ".opencode/agents/guionista.md",
            },
          ],
          commands: [],
          skills: [],
        },
        models: [
          {
            id: "hy4",
            name: "Hy4",
            providerId: "opencode-go",
            variants: ["high"],
          },
        ],
        onAgentChange,
        onModelChange,
      }),
    );
    panel.update(readyState());

    const agentSelect = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="chat-agent-select"]',
    )!;
    expect([...agentSelect.options].map((option) => option.value)).toEqual([
      "",
      "guionista",
    ]);
    agentSelect.value = "guionista";
    agentSelect.dispatchEvent(new Event("change"));
    expect(onAgentChange).toHaveBeenCalledWith("guionista");

    const modelSelect = panel.element.querySelector<HTMLSelectElement>(
      '[data-testid="chat-model-select"]',
    )!;
    expect([...modelSelect.options].map((option) => option.value)).toContain(
      "opencode-go/hy4#high",
    );
    modelSelect.value = "opencode-go/hy4#high";
    modelSelect.dispatchEvent(new Event("change"));
    expect(onModelChange).toHaveBeenCalledWith(
      "opencode-go",
      "hy4",
      "high",
    );
  });

  it("completes slash commands without sending the message (T-2.2.2)", () => {
    const onSend = vi.fn();
    const panel = new ChatPanel(
      options({
        onSend,
        kit: {
          agents: [],
          commands: [
            {
              id: "escena",
              name: "escena",
              description: "Escribe una escena",
              agent: "guionista",
              path: ".opencode/commands/escena.md",
            },
          ],
          skills: [],
        },
      }),
    );
    panel.update(readyState());
    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    input.value = "/esc";
    input.setSelectionRange(4, 4);
    input.dispatchEvent(new Event("input"));

    expect(panel.element.textContent).toContain("/escena");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(input.value).toBe("/escena ");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("completes @ file mentions from the composer and the attach button", () => {
    const panel = new ChatPanel(
      options({
        projectFiles: [{ path: "notas.md", name: "notas.md" }],
      }),
    );
    panel.update(readyState());
    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    input.value = "@not";
    input.setSelectionRange(4, 4);
    input.dispatchEvent(new Event("input"));
    expect(panel.element.textContent).toContain("notas.md");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(input.value).toBe("@notas.md ");

    input.value = "hola";
    input.setSelectionRange(4, 4);
    input.dispatchEvent(new Event("input"));
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="chat-attach"]')
      ?.click();
    expect(input.value).toBe("hola @");
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="composer-option-0"]')
      ?.click();
    expect(input.value).toBe("hola @notas.md ");
  });

  it("appends an editor selection to the current draft", () => {
    const panel = new ChatPanel(options());
    panel.update(readyState());
    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    input.value = "Revisa esto";
    input.dispatchEvent(new Event("input"));
    panel.appendDraft("Contexto de `notas.md`:\n> Texto seleccionado");
    expect(input.value).toContain("Revisa esto");
    expect(input.value).toContain("Contexto de `notas.md`");
    expect(input.value).toContain("> Texto seleccionado");
  });

});
