import { t } from "../i18n";
import { createIcon } from "../ui/icons";
import { Language, SearchMatch } from "../types";
import { filterQuickOpenFiles, QuickOpenFile } from "./quickOpen";

type PaletteItem =
  | { kind: "file"; file: QuickOpenFile; key: string }
  | { kind: "match"; match: SearchMatch; key: string };

export type SearchPaletteOptions =
  | {
      mode: "files";
      language: Language;
      files: QuickOpenFile[];
      onOpenFile: (path: string) => void;
      onClose: () => void;
    }
  | {
      mode: "content";
      language: Language;
      search: (query: string) => Promise<SearchMatch[]>;
      onOpenMatch: (match: SearchMatch) => void;
      onClose: () => void;
    };

/**
 * Inline command palette used by Quick Open and Find in Project. It owns its
 * input and result list so typing never forces a full application re-render.
 */
export class SearchPalette {
  private readonly root: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLElement;
  private readonly count: HTMLElement;
  private items: PaletteItem[] = [];
  private visibleItems: PaletteItem[] = [];
  private collapsedFiles = new Set<string>();
  private fileLimits = new Map<string, number>();
  private selectedIndex = 0;
  private requestGeneration = 0;
  private debounceTimer: number | null = null;

  constructor(private readonly options: SearchPaletteOptions) {
    this.root = document.createElement("div");
    this.root.className = "search-palette";

    this.input = document.createElement("input");
    this.input.className = "search-palette-input";
    this.input.type = "text";
    this.input.dataset.testid = "search-palette-input";
    this.input.placeholder = t(
      options.language,
      options.mode === "files" ? "quickOpenPlaceholder" : "globalSearchPlaceholder",
    );
    this.input.oninput = () => this.onInput();
    this.input.onkeydown = (event) => this.onKeyDown(event);

    this.results = document.createElement("div");
    this.results.className = "search-palette-results";

    const footer = document.createElement("div");
    footer.className = "search-palette-footer";
    const title = document.createElement("span");
    title.textContent = t(
      options.language,
      options.mode === "files" ? "quickOpenTitle" : "globalSearchTitle",
    );
    const hint = document.createElement("span");
    hint.className = "search-palette-hint";
    hint.textContent = t(options.language, "paletteHint");
    this.count = document.createElement("span");
    this.count.className = "search-palette-count";
    footer.append(title, this.count, hint);

    this.root.append(this.input, this.results, footer);

    if (options.mode === "files") {
      this.updateFiles("");
    } else {
      this.renderMessage(t(options.language, "globalSearchHint"));
    }
    window.setTimeout(() => this.input.focus(), 10);
  }

  public element(): HTMLElement {
    return this.root;
  }

  private onInput(): void {
    if (this.options.mode === "files") {
      this.updateFiles(this.input.value);
      return;
    }

    const query = this.input.value.trim();
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    if (query.length < 2) {
      this.requestGeneration += 1;
      this.items = [];
      this.renderMessage(t(this.options.language, "globalSearchHint"));
      return;
    }

    this.requestGeneration += 1;
    const generation = this.requestGeneration;
    this.renderMessage(t(this.options.language, "globalSearchLoading"));
    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      void this.runSearch(query, generation);
    }, 180);
  }

  private async runSearch(query: string, generation: number): Promise<void> {
    if (this.options.mode !== "content") return;
    try {
      const matches = await this.options.search(query);
      if (generation !== this.requestGeneration) return;
      this.items = matches.map((match) => ({
        kind: "match",
        match,
        key: `${match.path}:${match.line}:${match.column}`,
      }));
      const paths = [...new Set(matches.map((match) => match.path))];
      this.collapsedFiles = new Set(paths.slice(1));
      this.fileLimits.clear();
      this.selectedIndex = 0;
      this.renderItems();
    } catch (error) {
      if (generation !== this.requestGeneration) return;
      this.items = [];
      this.renderMessage(error instanceof Error ? error.message : String(error));
    }
  }

  private updateFiles(query: string): void {
    if (this.options.mode !== "files") return;
    this.items = filterQuickOpenFiles(this.options.files, query, 50).map((file) => ({
      kind: "file",
      file,
      key: file.path,
    }));
    this.selectedIndex = 0;
    this.renderItems();
  }

  private renderItems(): void {
    this.results.innerHTML = "";
    this.count.textContent = this.items.length
      ? t(this.options.language, "paletteResultCount", {
          count: String(this.items.length),
        })
      : "";
    if (this.items.length === 0) {
      this.visibleItems = [];
      this.renderMessage(
        t(
          this.options.language,
          this.options.mode === "files" ? "quickOpenEmpty" : "globalSearchNoResults",
        ),
      );
      return;
    }

    if (this.options.mode === "files") {
      this.visibleItems = this.items;
      this.items.forEach((item, index) => {
        this.results.appendChild(this.createItemRow(item, index));
      });
      this.updateSelection();
      return;
    }

    const groups = new Map<string, PaletteItem[]>();
    for (const item of this.items) {
      if (item.kind !== "match") continue;
      const group = groups.get(item.match.path) ?? [];
      group.push(item);
      groups.set(item.match.path, group);
    }

    this.visibleItems = [];
    for (const [path, group] of groups) {
      const collapsed = this.collapsedFiles.has(path);
      const header = document.createElement("button");
      header.type = "button";
      header.className = "search-palette-file";
      header.dataset.searchFile = path;
      header.setAttribute("aria-expanded", String(!collapsed));
      const chevron = document.createElement("span");
      chevron.className = "search-palette-file-chevron";
      chevron.appendChild(
        createIcon(collapsed ? "chevron-right" : "chevron-down", 12),
      );
      const filePath = document.createElement("span");
      filePath.className = "search-palette-file-path";
      filePath.textContent = path;
      const count = document.createElement("span");
      count.className = "search-palette-file-count";
      count.textContent = String(group.length);
      header.append(chevron, filePath, count);
      header.addEventListener("click", () => {
        if (this.collapsedFiles.has(path)) this.collapsedFiles.delete(path);
        else this.collapsedFiles.add(path);
        this.renderItems();
      });
      this.results.appendChild(header);
      if (collapsed) continue;

      const limit = this.fileLimits.get(path) ?? 5;
      for (const item of group.slice(0, limit)) {
        this.visibleItems.push(item);
        this.results.appendChild(
          this.createItemRow(item, this.visibleItems.length - 1),
        );
      }
      if (group.length > 5) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "search-palette-more";
        more.dataset.searchMore = path;
        const remaining = group.length - limit;
        if (remaining > 0) {
          more.textContent = t(this.options.language, "searchShowMore", {
            count: String(Math.min(10, remaining)),
          });
          more.addEventListener("click", () => {
            this.fileLimits.set(path, limit + 10);
            this.renderItems();
          });
        } else {
          more.textContent = t(this.options.language, "searchShowLess");
          more.addEventListener("click", () => {
            this.fileLimits.set(path, 5);
            this.renderItems();
          });
        }
        this.results.appendChild(more);
      }
    }

    if (this.selectedIndex >= this.visibleItems.length) {
      this.selectedIndex = 0;
    }
    this.updateSelection();
  }

  private createItemRow(item: PaletteItem, index: number): HTMLButtonElement {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "search-palette-item";
    row.dataset.searchIndex = String(index);

    const title = document.createElement("span");
    title.className = "search-palette-item-title";
    const subtitle = document.createElement("span");
    subtitle.className = "search-palette-item-subtitle";

    if (item.kind === "file") {
      title.textContent = item.file.name;
      subtitle.textContent = item.file.path;
    } else {
      title.textContent = `L${item.match.line}: ${item.match.snippet}`;
      subtitle.textContent = `${item.match.path}:${item.match.line}`;
    }

    row.append(title, subtitle);
    row.onclick = () => this.activate(index);
    row.onmouseenter = () => {
      this.selectedIndex = index;
      this.updateSelection();
    };
    return row;
  }

  private updateSelection(): void {
    const rows = this.results.querySelectorAll<HTMLElement>(".search-palette-item");
    rows.forEach((row, index) => row.classList.toggle("active", index === this.selectedIndex));
    const active = rows[this.selectedIndex];
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({ block: "nearest" });
    }
  }

  private renderMessage(text: string): void {
    this.results.innerHTML = "";
    this.visibleItems = [];
    this.count.textContent = "";
    const message = document.createElement("div");
    message.className = "search-palette-empty";
    message.textContent = text;
    this.results.appendChild(message);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (this.visibleItems.length > 0) {
        this.selectedIndex = (this.selectedIndex + 1) % this.visibleItems.length;
        this.updateSelection();
      }
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (this.visibleItems.length > 0) {
        this.selectedIndex =
          (this.selectedIndex - 1 + this.visibleItems.length) %
          this.visibleItems.length;
        this.updateSelection();
      }
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      this.activate(this.selectedIndex);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      this.options.onClose();
    }
  }

  private activate(index: number): void {
    const item = this.visibleItems[index];
    if (!item) return;
    if (item.kind === "file" && this.options.mode === "files") {
      this.options.onOpenFile(item.file.path);
    } else if (item.kind === "match" && this.options.mode === "content") {
      this.options.onOpenMatch(item.match);
    }
  }
}
