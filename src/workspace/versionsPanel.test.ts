// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createVersionsPanel, VersionsPanelHandlers, VersionsPanelState } from "./versionsPanel";

function state(overrides: Partial<VersionsPanelState> = {}): VersionsPanelState {
  return {
    language: "es",
    isRepository: true,
    branch: "main",
    entries: [
      { path: "biblia/premisa.md", index: "unmodified", worktree: "modified" },
      { path: "biblia/nueva.md", index: "untracked", worktree: "untracked" },
      { path: "biblia/vieja.md", index: "unmodified", worktree: "deleted" },
    ],
    history: [
      {
        id: "abc123",
        author: "Ana",
        email: "ana@example.com",
        date: new Date(2026, 10, 5, 18, 30).toISOString(),
        subject: "Primera versión",
      },
    ],
    branches: [
      { name: "main", id: "a", current: true },
      { name: "final-alternativo", id: "b", current: false },
    ],
    commitMessage: "",
    authorReady: true,
    busy: false,
    historyLoading: false,
    expandedCommitId: null,
    commitFiles: {},
    error: "",
    ...overrides,
  };
}

function handlers(): VersionsPanelHandlers {
  return {
    onInit: vi.fn(),
    onCommitMessageChange: vi.fn(),
    onSaveVersion: vi.fn(),
    onOpenChange: vi.fn(),
    onDiscardChange: vi.fn(),
    onToggleCommit: vi.fn(),
    onRestoreFile: vi.fn(),
    onCreateBranch: vi.fn(),
    onCheckoutBranch: vi.fn(),
    onOpenSettings: vi.fn(),
  };
}

describe("versions panel (T-1.4.4)", () => {
  it("offers to enable history on a plain folder", () => {
    const onInit = vi.fn();
    const panel = createVersionsPanel(state({ isRepository: false }), {
      ...handlers(),
      onInit,
    });

    expect(panel.textContent).toContain("Activa el historial de versiones");
    panel.querySelector<HTMLButtonElement>('[data-testid="enable-versions-btn"]')?.click();
    expect(onInit).toHaveBeenCalledOnce();
  });

  it("summarizes pending changes and saves a version", () => {
    const h = handlers();
    const panel = createVersionsPanel(
      state({ authorReady: false, commitMessage: "Acto 1" }),
      h,
    );

    expect(panel.textContent).toContain("Cambios pendientes (3)");
    expect(panel.textContent).toContain("Configura tu nombre y correo de autor");
    panel.querySelector<HTMLButtonElement>('[data-testid="versions-open-settings"]')?.click();
    expect(h.onOpenSettings).toHaveBeenCalledOnce();

    const input = panel.querySelector<HTMLInputElement>('[data-testid="version-message"]');
    expect(input?.value).toBe("Acto 1");
    input!.value = "Acto 1 revisado";
    input!.dispatchEvent(new Event("input"));
    expect(h.onCommitMessageChange).toHaveBeenCalledWith("Acto 1 revisado");

    panel.querySelector<HTMLButtonElement>('[data-testid="save-version-btn"]')?.click();
    expect(h.onSaveVersion).toHaveBeenCalledOnce();
  });

  it("lists current changes with human labels and opens the diff", () => {
    const h = handlers();
    const panel = createVersionsPanel(state(), h);

    expect(panel.textContent).toContain("Editado");
    expect(panel.textContent).toContain("Nuevo");
    expect(panel.textContent).toContain("Eliminado");

    const edited = panel.querySelector<HTMLElement>('[data-change-path="biblia/premisa.md"]');
    edited?.click();
    expect(h.onOpenChange).toHaveBeenCalledWith("biblia/premisa.md");

    const deleted = panel.querySelector<HTMLElement>('[data-change-path="biblia/vieja.md"]');
    deleted?.click();
    expect(h.onOpenChange).toHaveBeenCalledTimes(1);

    edited?.querySelector<HTMLButtonElement>(".version-row-btn")?.click();
    expect(h.onDiscardChange).toHaveBeenCalledWith("biblia/premisa.md");
    expect(h.onOpenChange).toHaveBeenCalledTimes(1);
  });

  it("expands a version and restores one of its files", () => {
    const onToggleCommit = vi.fn();
    const onRestoreFile = vi.fn();
    const panel = createVersionsPanel(
      state({
        expandedCommitId: "abc123",
        commitFiles: {
          abc123: [
            { path: "biblia/premisa.md", oldPath: null, status: "M" },
            { path: "biblia/renombrada.md", oldPath: "biblia/vieja.md", status: "R100" },
          ],
        },
      }),
      { ...handlers(), onToggleCommit, onRestoreFile },
    );

    expect(panel.textContent).toContain("Archivos de esta versión (2)");
    const head = panel.querySelector<HTMLButtonElement>('[data-commit-id="abc123"]');
    head?.click();
    expect(onToggleCommit).toHaveBeenCalledWith("abc123");

    const restore = panel.querySelector<HTMLButtonElement>(
      '[data-restore-path="biblia/renombrada.md"]',
    );
    restore?.click();
    expect(onRestoreFile).toHaveBeenCalledWith("abc123", "biblia/renombrada.md");
  });

  it("lists parallel drafts and switches between them", () => {
    const onCheckoutBranch = vi.fn();
    const onCreateBranch = vi.fn();
    const panel = createVersionsPanel(state(), {
      ...handlers(),
      onCheckoutBranch,
      onCreateBranch,
    });

    expect(panel.textContent).toContain("Borrador actual");
    panel.querySelector<HTMLButtonElement>('[data-testid="new-branch-btn"]')?.click();
    expect(onCreateBranch).toHaveBeenCalledOnce();

    panel.querySelector<HTMLButtonElement>('[data-branch-name="final-alternativo"]')?.click();
    expect(onCheckoutBranch).toHaveBeenCalledWith("final-alternativo");
  });
});
