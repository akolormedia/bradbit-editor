// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { GitStatusEntry } from "../types";
import {
  createVersionChangesView,
  VersionChangesViewHandlers,
  VersionChangesViewState,
} from "./versionChangesView";

const entries: GitStatusEntry[] = [
  { path: "guion/acto-1.fountain", index: "modified", worktree: "modified" },
  { path: "exports/acto.pdf", index: "untracked", worktree: "untracked" },
];

const patch = [
  "diff --git a/guion/acto-1.fountain b/guion/acto-1.fountain",
  "--- a/guion/acto-1.fountain",
  "+++ b/guion/acto-1.fountain",
  "@@ -1,3 +1,4 @@",
  " INT./EXT. CASA - DÍA",
  "-Cleia entra.",
  "+Cleia entra con el gato.",
  "+El gato maúlla.",
  " La casa está en silencio.",
].join("\n");

function state(overrides: Partial<VersionChangesViewState> = {}): VersionChangesViewState {
  return {
    language: "es",
    developerTerms: false,
    entries,
    stats: {
      "guion/acto-1.fountain": {
        path: "guion/acto-1.fountain",
        added: 2,
        removed: 1,
      },
      "exports/acto.pdf": { path: "exports/acto.pdf", added: 0, removed: 0 },
    },
    diffs: {
      "guion/acto-1.fountain": { status: "ready", patch },
      "exports/acto.pdf": { status: "ready", patch: "Binary files differ" },
    },
    expanded: new Set(["guion/acto-1.fountain", "exports/acto.pdf"]),
    selectedPath: "guion/acto-1.fountain",
    busy: false,
    ...overrides,
  };
}

function handlers(): VersionChangesViewHandlers {
  return {
    onToggleFile: vi.fn(),
    onSelectFile: vi.fn(),
    onFileContextMenu: vi.fn(),
    onToggleStage: vi.fn(),
    onStageSelected: vi.fn(),
    onUnstageSelected: vi.fn(),
    onStageAll: vi.fn(),
    onDiscardFile: vi.fn(),
    onExpandAll: vi.fn(),
    onCollapseAll: vi.fn(),
    onFocusComposer: vi.fn(),
  };
}

describe("version changes view (T-3.11.3)", () => {
  it("renders file accordions with stats and inline diff lines", () => {
    const calls = handlers();
    const root = createVersionChangesView(state(), calls);

    expect(root.querySelectorAll(".version-file-card")).toHaveLength(2);
    expect(root.textContent).toContain("+2");
    expect(root.textContent).toContain("-1");
    expect(root.querySelectorAll(".version-diff-added")).toHaveLength(2);
    expect(root.querySelectorAll(".version-diff-removed")).toHaveLength(1);
    expect(root.textContent).toContain("Cleia entra con el gato.");
    expect(root.textContent).toContain("Archivo binario");
  });

  it("toggles, selects and opens a file", () => {
    const calls = handlers();
    const root = createVersionChangesView(state(), calls);
    root
      .querySelector<HTMLButtonElement>(
        '[data-testid="version-toggle-guion/acto-1.fountain"]',
      )!
      .click();
    expect(calls.onToggleFile).toHaveBeenCalledWith("guion/acto-1.fountain");

    root
      .querySelector<HTMLElement>(
        '[data-version-file="guion/acto-1.fountain"] .version-file-header',
      )!
      .click();
    expect(calls.onSelectFile).toHaveBeenCalledWith("guion/acto-1.fountain");

    root
      .querySelector<HTMLElement>(
        '[data-version-file="guion/acto-1.fountain"] .version-file-header',
      )!
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    expect(calls.onFileContextMenu).toHaveBeenCalledWith(
      "guion/acto-1.fountain",
      expect.any(MouseEvent),
    );

  });

  it("offers Discard changes for the whole hunk block", () => {
    const calls = handlers();
    const root = createVersionChangesView(state(), calls);
    const pill = root.querySelector(".version-hunk-actions");
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain("Discard changes");
    pill!.querySelector<HTMLButtonElement>(".version-hunk-action")!.click();
    expect(calls.onDiscardFile).toHaveBeenCalledWith(
      "guion/acto-1.fountain",
    );
  });

  it("stages the selected file and focuses the composer", () => {
    const calls = handlers();
    const root = createVersionChangesView(state(), calls);
    root
      .querySelector<HTMLButtonElement>('[data-testid="version-unstage-selected"]')!
      .click();
    expect(calls.onUnstageSelected).toHaveBeenCalledOnce();
    root
      .querySelector<HTMLButtonElement>('[data-testid="version-focus-composer"]')!
      .click();
    expect(calls.onFocusComposer).toHaveBeenCalledOnce();
  });

  it("expands and collapses all files", () => {
    const calls = handlers();
    const root = createVersionChangesView(state(), calls);
    const tools = root.querySelectorAll<HTMLButtonElement>(".version-tool-btn");
    tools[0].click();
    tools[1].click();
    expect(calls.onExpandAll).toHaveBeenCalledOnce();
    expect(calls.onCollapseAll).toHaveBeenCalledOnce();
  });
});
