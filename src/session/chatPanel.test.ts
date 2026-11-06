// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { ChatPanel, ChatPanelOptions } from "./chatPanel";
import { appendUserMessage, chatStarted, chatStarting, initialChatState } from "./chatState";

function options(overrides: Partial<ChatPanelOptions> = {}): ChatPanelOptions {
  return {
    language: "es",
    projectName: "mi-guion",
    onSend: vi.fn(),
    onStop: vi.fn(),
    onRetry: vi.fn(),
    onToggleEditor: vi.fn(),
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
          id: "assistant:msg_a:0",
          role: "assistant",
          text: "Hola, ¿en qué trabajamos?",
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

  it("toggles the editor from the session header", () => {
    const onToggleEditor = vi.fn();
    const panel = new ChatPanel(options({ onToggleEditor }));
    panel.element
      .querySelector<HTMLButtonElement>('[data-testid="session-toggle-editor"]')
      ?.click();
    expect(onToggleEditor).toHaveBeenCalledOnce();
  });
});
