import { t } from "../i18n";
import { createIcon } from "../ui/icons";
import { Language, SearchContextLine, SearchMatch } from "../types";
import { SearchBarQuery } from "../editor/searchBar";
import {
  findSearchHighlights,
  buildProjectSearchContextBlocks,
  groupProjectSearchMatches,
  projectSearchFileDir,
  projectSearchFileName,
  projectSearchSummary,
} from "./projectSearch";

export interface ProjectSearchViewState {
  language: Language;
  query: SearchBarQuery;
  results: SearchMatch[];
  loading: boolean;
  error: string;
}

export interface ProjectSearchViewOptions {
  language: Language;
  onOpenMatch: (match: SearchMatch) => void;
}

/**
 * Search results inside the project-search tab. It owns the accordion state
 * and the selected result, so typing in the shared search bar never rebuilds
 * the bar itself.
 */
export class ProjectSearchView {
  private readonly root: HTMLElement;
  private readonly summary: HTMLElement;
  private readonly list: HTMLElement;
  private state: ProjectSearchViewState;
  private queryKey = "";
  private collapsed = new Set<string>();
  private selectedIndex = 0;

  constructor(private readonly options: ProjectSearchViewOptions) {
    this.state = {
      language: options.language,
      query: {
        search: "",
        caseSensitive: false,
        wholeWord: false,
        regexp: false,
      },
      results: [],
      loading: false,
      error: "",
    };
    this.root = document.createElement("div");
    this.root.className = "project-search-view";
    this.root.dataset.testid = "project-search-view";

    this.summary = document.createElement("div");
    this.summary.className = "project-search-summary";
    this.summary.dataset.testid = "project-search-summary";

    this.list = document.createElement("div");
    this.list.className = "version-file-list project-search-list";

    this.root.append(this.summary, this.list);
    this.render();
  }

  public element(): HTMLElement {
    return this.root;
  }

  public update(state: ProjectSearchViewState): void {
    const key = JSON.stringify(state.query);
    if (key !== this.queryKey) {
      this.queryKey = key;
      this.collapsed.clear();
      this.selectedIndex = 0;
    }
    this.state = state;
    if (this.selectedIndex >= state.results.length) {
      this.selectedIndex = 0;
    }
    this.render();
  }

  public selectionInfo(): { current: number; total: number } {
    const total = this.state.results.length;
    return total > 0
      ? { current: this.selectedIndex + 1, total }
      : { current: 0, total: 0 };
  }

  public selectedMatch(): SearchMatch | null {
    return this.state.results[this.selectedIndex] ?? null;
  }

  public selectNext(): void {
    this.selectBy(1);
  }

  public selectPrevious(): void {
    this.selectBy(-1);
  }

  private selectBy(delta: number): void {
    const total = this.state.results.length;
    if (total === 0) return;
    this.selectedIndex = (this.selectedIndex + delta + total) % total;
    const match = this.state.results[this.selectedIndex];
    this.collapsed.delete(match.path);
    this.render();
  }

  private render(): void {
    const language = this.state.language;
    this.summary.textContent = "";
    this.list.innerHTML = "";

    if (this.state.loading) {
      const loading = document.createElement("div");
      loading.className = "project-search-message";
      const spinner = document.createElement("span");
      spinner.className = "project-search-spinner";
      spinner.appendChild(createIcon("refresh-cw", 13));
      const text = document.createElement("span");
      text.textContent = t(language, "globalSearchLoading");
      loading.append(spinner, text);
      this.summary.appendChild(loading);
    }

    if (this.state.error) {
      this.renderMessage(this.state.error, "error");
      return;
    }

    if (this.state.query.search.trim().length < 2) {
      this.renderMessage(t(language, "globalSearchHint"));
      return;
    }

    if (this.state.loading && this.state.results.length === 0) {
      return;
    }

    if (this.state.results.length === 0) {
      this.renderMessage(t(language, "globalSearchNoResults"));
      return;
    }

    const groups = groupProjectSearchMatches(this.state.results);
    this.summary.textContent = projectSearchSummary(
      language,
      this.state.results.length,
      groups.length,
    );

    const indexes = new Map<string, number>();
    this.state.results.forEach((match, index) => {
      indexes.set(`${match.path}:${match.line}`, index);
    });
    for (const group of groups) {
      this.list.appendChild(this.renderFileCard(group, indexes));
    }

    const active = this.list.querySelector<HTMLElement>(
      `.project-search-result[data-index="${this.selectedIndex}"]`,
    );
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  private renderFileCard(
    group: { path: string; matches: SearchMatch[] },
    indexes: Map<string, number>,
  ): HTMLElement {
    const collapsed = this.collapsed.has(group.path);
    const card = document.createElement("section");
    card.className = "version-file-card project-search-file-card";
    card.classList.toggle("expanded", !collapsed);

    const header = document.createElement("header");
    header.className = "version-file-header";
    header.onclick = () => this.toggleFile(group.path);

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "version-file-toggle";
    toggle.dataset.testid = "project-search-toggle";
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.title = t(this.state.language, "globalSearchTitle");
    toggle.appendChild(
      createIcon(collapsed ? "chevron-right" : "chevron-down", 12),
    );
    toggle.onclick = (event) => {
      event.stopPropagation();
      this.toggleFile(group.path);
    };

    const name = document.createElement("span");
    name.className = "version-file-name";
    name.textContent = projectSearchFileName(group.path);
    const dir = document.createElement("span");
    dir.className = "version-file-dir";
    dir.textContent = projectSearchFileDir(group.path);
    const count = document.createElement("span");
    count.className = "version-file-label";
    count.textContent = String(group.matches.length);
    count.title = t(this.state.language, "projectSearchMatchCount", {
      count: String(group.matches.length),
    });

    const open = document.createElement("button");
    open.type = "button";
    open.className = "project-search-open-file";
    open.dataset.testid = "project-search-open-file";
    open.textContent = t(this.state.language, "projectSearchOpenFile");
    open.onclick = (event) => {
      event.stopPropagation();
      const first = group.matches[0];
      if (first) this.options.onOpenMatch(first);
    };

    header.append(toggle, name, dir, count, open);
    card.appendChild(header);
    if (collapsed) return card;

    const results = document.createElement("div");
    results.className = "project-search-file-results";
    const blocks = buildProjectSearchContextBlocks(group.matches);
    blocks.forEach((block, blockIndex) => {
      if (blockIndex > 0) {
        const divider = document.createElement("div");
        divider.className = "project-search-context-divider";
        results.appendChild(divider);
      }
      const blockEl = document.createElement("div");
      blockEl.className = "project-search-context-block";
      for (const contextLine of block.lines) {
        blockEl.appendChild(
          this.renderContextLine(group.path, contextLine, indexes),
        );
      }
      results.appendChild(blockEl);
    });
    card.appendChild(results);
    return card;
  }

  private renderContextLine(
    path: string,
    contextLine: SearchContextLine,
    indexes: Map<string, number>,
  ): HTMLElement {
    const index = indexes.get(`${path}:${contextLine.line}`);
    const isMatch = contextLine.isMatch && index !== undefined;
    const row = document.createElement(isMatch ? "button" : "div");
    if (isMatch) {
      (row as HTMLButtonElement).type = "button";
    }
    row.className = "project-search-context-line";
    row.dataset.contextLine = String(contextLine.line);
    if (isMatch) {
      row.classList.add("match", "project-search-result");
      row.dataset.testid = "project-search-result";
      row.dataset.index = String(index);
      row.dataset.path = path;
      row.dataset.line = String(contextLine.line);
      row.classList.toggle("selected", index === this.selectedIndex);
      row.title = t(this.state.language, "projectSearchResultTitle", {
        path,
        line: String(contextLine.line),
      });
      row.onclick = () => {
        const match = this.state.results[index];
        if (match) this.options.onOpenMatch(match);
      };
    }

    const lineNumber = document.createElement("span");
    lineNumber.className = "project-search-line";
    lineNumber.textContent = String(contextLine.line);

    const text = document.createElement("span");
    text.className = "project-search-text";
    this.appendHighlights(text, contextLine.text);

    row.append(lineNumber, text);
    return row;
  }

  private appendHighlights(parent: HTMLElement, text: string): void {
    const ranges = findSearchHighlights(text, this.state.query);
    if (ranges.length === 0) {
      parent.textContent = text;
      return;
    }
    let cursor = 0;
    for (const range of ranges) {
      if (range.start > cursor) {
        parent.appendChild(document.createTextNode(text.slice(cursor, range.start)));
      }
      const mark = document.createElement("mark");
      mark.className = "project-search-highlight";
      mark.textContent = text.slice(range.start, range.end);
      parent.appendChild(mark);
      cursor = range.end;
    }
    if (cursor < text.length) {
      parent.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }

  private toggleFile(path: string): void {
    if (this.collapsed.has(path)) this.collapsed.delete(path);
    else this.collapsed.add(path);
    this.render();
  }

  private renderMessage(message: string, kind?: "error"): void {
    const empty = document.createElement("div");
    empty.className = `project-search-message${kind === "error" ? " error" : ""}`;
    empty.dataset.testid = "project-search-message";
    empty.textContent = message;
    this.list.appendChild(empty);
  }
}
