// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDocumentHeader } from "./documentHeader";
import { OpenTab } from "../types";

function tab(overrides: Partial<OpenTab> = {}): OpenTab {
  return {
    path: "biblia/premisa.md",
    name: "premisa.md",
    content: "# Premisa",
    savedContent: "# Premisa",
    preview: false,
    cursorLine: 1,
    cursorCol: 1,
    viewMode: "edit",
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("active document header (T-1.2.1)", () => {
  it("shows the document identity and the preview/copy actions for Markdown", () => {
    const header = createDocumentHeader({
      tab: tab(),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
    });

    expect(header.querySelector(".document-name")?.textContent).toBe("premisa.md");
    expect(header.querySelector(".document-path")?.textContent).toBe("biblia/premisa.md");
    expect(header.querySelector('[data-action="preview"]')).not.toBeNull();
    expect(header.querySelector('[data-action="copy"]')).not.toBeNull();
  });

  it("hides the preview action for non-Markdown files", () => {
    const header = createDocumentHeader({
      tab: tab({ path: "guion/acto-1.fountain", name: "acto-1.fountain" }),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
    });

    expect(header.querySelector('[data-action="preview"]')).toBeNull();
    expect(header.querySelector('[data-action="copy"]')).not.toBeNull();
  });

  it("shows the PDF export action for Fountain when a handler is provided (T-1.2.3)", () => {
    const onExportPdf = vi.fn();
    const header = createDocumentHeader({
      tab: tab({ path: "guion/acto-1.fountain", name: "acto-1.fountain" }),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
      onExportPdf,
    });

    const button = header.querySelector<HTMLButtonElement>('[data-action="export-pdf"]');
    expect(button).not.toBeNull();
    expect(button?.title).toContain("Exportar PDF");
    button?.click();
    expect(onExportPdf).toHaveBeenCalledOnce();
  });

  it("does not show the PDF export action without a native handler", () => {
    const header = createDocumentHeader({
      tab: tab({ path: "guion/acto-1.fountain", name: "acto-1.fountain" }),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
    });
    expect(header.querySelector('[data-action="export-pdf"]')).toBeNull();
  });

  it("marks the preview button as pressed and calls the toggle handler", () => {
    const onTogglePreview = vi.fn();
    const header = createDocumentHeader({
      tab: tab({ viewMode: "preview" }),
      language: "es",
      onTogglePreview,
      onCopy: async () => true,
    });

    const button = header.querySelector<HTMLButtonElement>('[data-action="preview"]');
    expect(button?.getAttribute("aria-pressed")).toBe("true");
    expect(button?.title).toContain("Editar");
    button?.click();
    expect(onTogglePreview).toHaveBeenCalledOnce();
  });

  it("copies the document and shows temporary feedback", async () => {
    vi.useFakeTimers();
    const onCopy = vi.fn(async () => true);
    const header = createDocumentHeader({
      tab: tab(),
      language: "es",
      onTogglePreview: () => {},
      onCopy,
    });
    document.body.appendChild(header);

    const button = header.querySelector<HTMLButtonElement>('[data-action="copy"]');
    button?.click();
    await vi.advanceTimersByTimeAsync(0);

    expect(onCopy).toHaveBeenCalledOnce();
    expect(button?.getAttribute("aria-label")).toBe("Copiado");
    expect(button?.querySelector(".icon-check")).not.toBeNull();

    await vi.advanceTimersByTimeAsync(1500);
    expect(button?.getAttribute("aria-label")).toBe("Copiar");
    expect(button?.querySelector(".icon-copy")).not.toBeNull();
    header.remove();
  });

  it("shows Diff and Discard actions when the file has Git changes (T-1.4.3)", () => {
    const onToggleDiff = vi.fn();
    const onDiscard = vi.fn();
    const header = createDocumentHeader({
      tab: tab({ viewMode: "diff" }),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
      canDiff: true,
      diffActive: true,
      onToggleDiff,
      canDiscard: true,
      onDiscard,
    });

    const diffBtn = header.querySelector<HTMLButtonElement>('[data-action="diff"]');
    expect(diffBtn).not.toBeNull();
    expect(diffBtn?.getAttribute("aria-pressed")).toBe("true");
    expect(diffBtn?.title).toBe("Diff");
    diffBtn?.click();
    expect(onToggleDiff).toHaveBeenCalledOnce();

    const discardBtn = header.querySelector<HTMLButtonElement>('[data-action="discard"]');
    expect(discardBtn).not.toBeNull();
    expect(discardBtn?.title).toBe("Descartar cambios");
    discardBtn?.click();
    expect(onDiscard).toHaveBeenCalledOnce();
  });

  it("hides Diff and Discard actions for files without Git changes", () => {
    const header = createDocumentHeader({
      tab: tab(),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
    });

    expect(header.querySelector('[data-action="diff"]')).toBeNull();
    expect(header.querySelector('[data-action="discard"]')).toBeNull();
  });

  it("sends the editor selection to chat when the action is provided (T-2.2.2)", () => {
    const onSendSelection = vi.fn();
    const header = createDocumentHeader({
      tab: tab(),
      language: "es",
      onTogglePreview: () => {},
      onCopy: async () => true,
      onSendSelection,
    });

    const button = header.querySelector<HTMLButtonElement>(
      '[data-action="send-selection"]',
    );
    expect(button).not.toBeNull();
    expect(button?.title).toContain("Enviar selección al chat");
    button?.click();
    expect(onSendSelection).toHaveBeenCalledOnce();
  });

});
