// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { GitStatusEntry } from "../types";
import {
  createVersionSidebar,
  VersionSidebarHandlers,
  VersionSidebarState,
} from "./versionSidebar";

const entries: GitStatusEntry[] = [
  { path: "guion/acto-1.fountain", index: "modified", worktree: "modified" },
  { path: "notas/nueva.md", index: "untracked", worktree: "untracked" },
];

function state(overrides: Partial<VersionSidebarState> = {}): VersionSidebarState {
  return {
    language: "es",
    developerTerms: false,
    view: "changes",
    filter: "all",
    isRepository: true,
    branch: "main",
    ahead: 2,
    behind: 0,
    entries,
    stats: {
      "guion/acto-1.fountain": {
        path: "guion/acto-1.fountain",
        added: 3,
        removed: 1,
      },
      "notas/nueva.md": { path: "notas/nueva.md", added: 8, removed: 0 },
    },
    selectedPath: "guion/acto-1.fountain",
    history: [],
    branches: [],
    historyLoading: false,
    expandedCommitId: null,
    commitFiles: {},
    commitMessage: "Ajusta la llegada",
    authorReady: true,
    busy: false,
    error: "",
    githubTokenPresent: false,
    githubAccount: null,
    hasRemote: false,
    githubRepo: null,
    githubPullRequests: [],
    githubPrLoading: false,
    generatingMessage: false,
    ...overrides,
  };
}

function handlers(): VersionSidebarHandlers {
  return {
    onInit: vi.fn(),
    onViewChange: vi.fn(),
    onFilterChange: vi.fn(),
    onSelectChange: vi.fn(),
    onOpenChanges: vi.fn(),
    onToggleStage: vi.fn(),
    onStagePaths: vi.fn(),
    onUnstagePaths: vi.fn(),
    onStageAll: vi.fn(),
    onUnstageAll: vi.fn(),
    onDiscardChange: vi.fn(),
    onCommitMessageChange: vi.fn(),
    onSaveVersion: vi.fn(),
    onGenerateMessage: vi.fn(),
    onToggleCommit: vi.fn(),
    onRestoreFile: vi.fn(),
    onCreateBranch: vi.fn(),
    onCheckoutBranch: vi.fn(),
    onOpenSettings: vi.fn(),
    onBranchMenu: vi.fn(),
    onPush: vi.fn(),
    onPublish: vi.fn(),
    onConnectGitHub: vi.fn(),
    onOpenGitHubUrl: vi.fn(),
    onRefreshPullRequests: vi.fn(),
    onOpenPullRequest: vi.fn(),
  };
}

describe("version sidebar (T-3.11.2)", () => {
  it("renders changes with counts, stats and staging checkboxes", () => {
    const calls = handlers();
    const root = createVersionSidebar(state(), calls);

    expect(root.textContent).toContain("Cambios (2)");
    expect(root.textContent).toContain("+3");
    expect(root.textContent).toContain("-1");
    expect(root.querySelectorAll(".version-change-row")).toHaveLength(2);

    const staged = root.querySelector<HTMLInputElement>(
      '[data-stage-path="guion/acto-1.fountain"]',
    )!;
    const untracked = root.querySelector<HTMLInputElement>(
      '[data-stage-path="notas/nueva.md"]',
    )!;
    expect(staged.checked).toBe(true);
    expect(untracked.checked).toBe(false);

    untracked.checked = true;
    untracked.dispatchEvent(new Event("change"));
    expect(calls.onToggleStage).toHaveBeenCalledWith("notas/nueva.md");
  });

  it("selects a file and opens the changes tab", () => {
    const calls = handlers();
    const root = createVersionSidebar(state(), calls);
    const row = root.querySelector<HTMLElement>(
      '[data-change-path="notas/nueva.md"]',
    )!;
    row.click();
    expect(calls.onSelectChange).toHaveBeenCalledWith("notas/nueva.md");

    root.querySelector<HTMLButtonElement>('[data-testid="version-view-diff"]')!.click();
    expect(calls.onOpenChanges).toHaveBeenCalledOnce();
  });

  it("stages all and saves only prepared files", () => {
    const calls = handlers();
    const root = createVersionSidebar(state(), calls);
    root.querySelector<HTMLButtonElement>('[data-testid="version-stage-all"]')!.click();
    expect(calls.onStageAll).toHaveBeenCalledOnce();

    const save = root.querySelector<HTMLButtonElement>(
      '[data-testid="save-version-btn"]',
    )!;
    expect(save.disabled).toBe(false);
    save.click();
    expect(calls.onSaveVersion).toHaveBeenCalledWith(false);
  });

  it("enables the save button as soon as the author writes notes", () => {
    const root = createVersionSidebar(state({ commitMessage: "" }), handlers());
    const save = root.querySelector<HTMLButtonElement>(
      '[data-testid="save-version-btn"]',
    )!;
    expect(save.disabled).toBe(true);

    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-testid="version-message"]',
    )!;
    input.value = "Cierra la escena del gato";
    input.dispatchEvent(new Event("input"));
    expect(save.disabled).toBe(false);
  });

  it("disables the version button when there is nothing prepared", () => {
    const root = createVersionSidebar(
      state({
        entries: [
          {
            path: "guion/acto-1.fountain",
            index: "unmodified",
            worktree: "modified",
          },
        ],
      }),
      handlers(),
    );
    const save = root.querySelector<HTMLButtonElement>(
      '[data-testid="save-version-btn"]',
    )!;
    expect(save.disabled).toBe(true);
    expect(root.textContent).toContain("Prepara al menos un archivo");
  });

  it("shows the history and toggles a commit", () => {
    const calls = handlers();
    const root = createVersionSidebar(
      state({
        view: "history",
        history: [
          {
            id: "abc",
            author: "Ana",
            email: "ana@example.com",
            date: "2026-11-25T10:00:00Z",
            subject: "Primera versión",
          },
        ],
      }),
      calls,
    );
    expect(root.textContent).toContain("Primera versión");
    root.querySelector<HTMLButtonElement>('[data-commit-id="abc"]')!.click();
    expect(calls.onToggleCommit).toHaveBeenCalledWith("abc");
  });

  it("opens the branch menu and the AI notes action", () => {
    const calls = handlers();
    const root = createVersionSidebar(state(), calls);
    root
      .querySelector<HTMLButtonElement>('[data-testid="version-branch-menu"]')!
      .click();
    expect(calls.onBranchMenu).toHaveBeenCalledOnce();

    root
      .querySelector<HTMLButtonElement>('[data-testid="version-generate-message"]')!
      .click();
    expect(calls.onGenerateMessage).toHaveBeenCalledOnce();
  });
});
