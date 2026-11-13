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
    onOpenSettings: vi.fn(),
    onSelectSession: vi.fn(),
    onCreateSession: vi.fn(),
    onCloseSession: vi.fn(),
    onRenameSession: vi.fn(),
    onOpenToolFile: vi.fn(),
    onPermissionReply: vi.fn(),
    onFormReply: vi.fn(),
    kit: { agents: [], commands: [], skills: [] },
    models: [],
    projectFiles: [],
    hiddenModels: [],
    recentModels: [],
    onAgentChange: vi.fn(),
    onModelChange: vi.fn(),
    onManageModels: vi.fn(),
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
  it("shows the empty state, connection status and composer instructions", () => {
    const panel = new ChatPanel(options());
    expect(panel.element.textContent).toContain("Habla con tu agente");
    expect(panel.element.textContent).toContain("Sin sesión");
    const input = panel.element.querySelector<HTMLTextAreaElement>(
      '[data-testid="chat-input"]',
    )!;
    expect(input.placeholder).toContain("/");
    expect(input.placeholder).toContain("@");
  });

  it("renames a session from the tab with Enter and cancels with Escape (T-2.5.3)", () => {
    const onRenameSession = vi.fn();
    const panel = new ChatPanel(options({ onRenameSession }));
    panel.update(readyState());

    const tab = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="session-tab-ses_test"]',
    )!;
    tab.click();
    tab.click();
    const input = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="session-rename-ses_test"]',
    )!;
    expect(input).not.toBeNull();

    input.value = "Guion principal";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(onRenameSession).toHaveBeenCalledWith("ses_test", "Guion principal");
    expect(
      panel.element.querySelector('[data-testid="session-rename-ses_test"]'),
    ).toBeNull();

    tab.click();
    tab.click();
    const cancelled = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="session-rename-ses_test"]',
    )!;
    cancelled.value = "No guardar";
    cancelled.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(onRenameSession).toHaveBeenCalledTimes(1);

    tab.click();
    tab.click();
    const empty = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="session-rename-ses_test"]',
    )!;
    empty.value = "   ";
    empty.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
    expect(onRenameSession).toHaveBeenCalledTimes(1);
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

  it("offers a direct settings action for missing provider/model errors (T-3.1.8)", () => {
    const onOpenSettings = vi.fn();
    const panel = new ChatPanel(options({ onOpenSettings }));
    panel.update({
      ...readyState(),
      status: "error",
      error: "The Bradbit agent runtime has no models available.",
      errorAction: "models",
    });

    const settings = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="chat-error-settings"]',
    )!;
    expect(settings.hidden).toBe(false);
    settings.click();
    expect(onOpenSettings).toHaveBeenCalledOnce();

    panel.update({
      ...readyState(),
      status: "error",
      error: "Unexpected failure",
      errorAction: null,
    });
    expect(settings.hidden).toBe(true);
  });

  it("renders assistant text as Markdown (T-2.5.1)", () => {
    const panel = new ChatPanel(options());
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
              text: "**Negrita** y `código`",
            },
          ],
        },
      ],
      streaming: false,
    };
    panel.update(state);

    const bubble = panel.element.querySelector(
      ".chat-message-markdown",
    ) as HTMLElement | null;
    expect(bubble).not.toBeNull();
    expect(bubble?.querySelector("strong")?.textContent).toBe("Negrita");
    expect(bubble?.querySelector("code")?.textContent).toBe("código");
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
                answers: [],
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

    expect(panel.element.textContent).toContain("El agente solicita permiso");
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
    const answered = panel.element.querySelector<HTMLElement>(
      '[data-testid="form-answer-frm_1"]',
    )!;
    expect(answered.textContent).toContain("Color favorito");
    expect(answered.textContent).toContain("Rojo");
    const selected = answered.querySelectorAll(".chat-question-option.selected");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Rojo");
  });

  it("renders question tool calls as friendly options with the chosen answer (T-2.5.8)", () => {
    const panel = new ChatPanel(options());
    panel.update({
      ...readyState(),
      messages: [
        {
          id: "msg_q",
          role: "assistant",
          parts: [
            {
              type: "tool",
              tool: {
                id: "tool_q",
                name: "question",
                status: "completed",
                input: {
                  questions: [
                    {
                      header: "Siguiente paso",
                      question: "¿Qué quieres hacer ahora?",
                      options: [
                        {
                          label: "Revisar Ep.1",
                          description: "Leer el borrador y dar notas",
                        },
                        {
                          label: "Pausar",
                          description: "Dejar aquí por ahora",
                        },
                      ],
                    },
                  ],
                },
                output:
                  'User has answered your questions: "¿Qué quieres hacer ahora?"="Pausar".',
                error: "",
                executed: false,
                files: [],
                answers: [["Pausar"]],
              },
            },
          ],
        },
      ],
    });

    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="tool-toggle-tool_q"]')
      ?.click();
    const card = panel.element.querySelector<HTMLElement>(
      '[data-testid="tool-question-tool_q"]',
    )!;
    expect(card.textContent).toContain("¿Qué quieres hacer ahora?");
    expect(card.textContent).toContain("Revisar Ep.1");
    expect(card.textContent).toContain("Pausar");
    expect(card.textContent).not.toContain('"questions"');
    expect(card.textContent).not.toContain("User has answered");
    const selected = card.querySelectorAll(".chat-question-option.selected");
    expect(selected).toHaveLength(1);
    expect(selected[0].textContent).toContain("Pausar");
  });

  it("shows the current model and effort and filters the model picker (T-2.2.3)", () => {
    const onModelChange = vi.fn();
    const panel = new ChatPanel(
      options({
        models: [
          {
            id: "hy4",
            name: "Hy4",
            providerId: "opencode-go",
            variants: ["high", "max"],
          },
          {
            id: "gpt-5",
            name: "GPT-5",
            providerId: "openai",
            variants: ["none"],
          },
        ],
        onModelChange,
      }),
    );
    panel.update({ ...readyState(), model: "opencode-go/hy4#max" });

    const modelButton = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="chat-model-button"]',
    )!;
    expect(modelButton.textContent).toContain("OpenCode Go");
    expect(modelButton.textContent).toContain("Hy4");
    const effortButton = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="chat-effort-button"]',
    )!;
    expect(effortButton.textContent).toContain("Max");

    modelButton.click();
    expect(
      panel.element.querySelector<HTMLElement>(".chat-model-popover")?.hidden,
    ).toBe(false);
    const search = panel.element.querySelector<HTMLInputElement>(
      '[data-testid="chat-model-search"]',
    )!;
    search.value = "gpt";
    search.dispatchEvent(new Event("input"));
    expect(
      panel.element.querySelector('[data-testid="chat-model-row-openai-gpt-5"]'),
    ).not.toBeNull();
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="chat-model-row-openai-gpt-5"]',
      )
      ?.click();
    expect(onModelChange).toHaveBeenCalledWith("openai", "gpt-5", undefined);

    panel.update({ ...readyState(), model: "opencode-go/hy4#max" });
    effortButton.click();
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="chat-effort-row-high"]')
      ?.click();
    expect(onModelChange).toHaveBeenCalledWith(
      "opencode-go",
      "hy4",
      "high",
    );
  });

  it("hides disabled models and shows recent models (T-2.2.3)", () => {
    const panel = new ChatPanel(
      options({
        models: [
          {
            id: "hy4",
            name: "Hy4",
            providerId: "opencode-go",
            variants: ["max"],
          },
          {
            id: "gpt-5",
            name: "GPT-5",
            providerId: "openai",
            variants: [],
          },
        ],
        hiddenModels: ["openai/gpt-5"],
        recentModels: ["opencode-go/hy4"],
      }),
    );
    panel.update({ ...readyState(), model: "opencode-go/hy4#max" });
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="chat-model-button"]')
      ?.click();
    expect(panel.element.textContent).toContain("Recientes");
    expect(
      panel.element.querySelector('[data-testid="chat-model-row-openai-gpt-5"]'),
    ).toBeNull();
    expect(
      panel.element.querySelector('[data-testid="chat-model-row-opencode-go-hy4"]'),
    ).not.toBeNull();
  });

  it("opens the plus menu with files, commands, agents and model settings (T-2.2.3)", () => {
    const onAgentChange = vi.fn();
    const onManageModels = vi.fn();
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
        onAgentChange,
        onManageModels,
      }),
    );
    panel.update(readyState());
    const plus = panel.element.querySelector<HTMLButtonElement>(
      '[data-testid="chat-plus"]',
    )!;
    plus.click();
    expect(panel.element.textContent).toContain("Archivo de contexto");
    expect(panel.element.textContent).toContain("Comando");
    expect(panel.element.textContent).toContain("Agente del kit");
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="composer-agent-guionista"]')
      ?.click();
    expect(onAgentChange).toHaveBeenCalledWith("guionista");

    plus.click();
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="composer-plus-manage-models"]',
      )
      ?.click();
    expect(onManageModels).toHaveBeenCalledOnce();
  });

  it("shows localized agent labels but switches with the canonical id", () => {
    const onAgentChange = vi.fn();
    const panel = new ChatPanel(
      options({
        kit: {
          agents: [
            {
              id: "screenwriter",
              name: "Screenwriter",
              description: "Writes scenes",
              path: ".bradbit/agents/screenwriter.md",
              i18n: {
                es: {
                  name: "Guionista",
                  description: "Escribe escenas",
                },
              },
            },
          ],
          commands: [],
          skills: [],
        },
        onAgentChange,
      }),
    );
    panel.update(readyState());
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="chat-plus"]')
      ?.click();
    expect(panel.element.textContent).toContain("Guionista");
    panel.element
      .querySelector<HTMLButtonElement>(
        '[data-testid="composer-agent-screenwriter"]',
      )
      ?.click();
    expect(onAgentChange).toHaveBeenCalledWith("screenwriter");
  });

  it("localizes slash command labels and inserts the canonical id", () => {
    const panel = new ChatPanel(
      options({
        kit: {
          agents: [],
          commands: [
            {
              id: "scene",
              name: "Scene",
              description: "Write a scene",
              agent: "screenwriter",
              path: ".bradbit/commands/scene.md",
              i18n: {
                es: {
                  name: "Escena",
                  description: "Escribe una escena",
                  aliases: ["escena"],
                },
              },
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

    expect(panel.element.textContent).toContain("/Escena");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(input.value).toBe("/scene ");
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
      .querySelector<HTMLButtonElement>('[data-testid="chat-plus"]')
      ?.click();
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="composer-plus-file"]')
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
