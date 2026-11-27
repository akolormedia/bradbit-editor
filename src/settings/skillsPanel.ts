import { t, TranslationKey } from "../i18n";
import {
  Language,
  SkillCatalog,
  SkillDocument,
  SkillInfo,
  SkillSource,
} from "../types";
import { renderMarkdownPreview } from "../editor/preview";
import { createIcon } from "../ui/icons";
import {
  DEFAULT_SKILL_FILTERS,
  SkillFilters,
  SkillScopeFilter,
  SkillSourceFilter,
  SkillStateFilter,
  countEffectiveSkills,
  filterSkills,
  localizedSkillAliases,
  localizedSkillDescription,
  localizedSkillName,
  skillScopeLabelKey,
  skillSourceLabelKey,
  skillState,
  skillStateLabelKey,
} from "./skills";

export interface SettingsSkillsState extends SkillFilters {
  selectedPath: string | null;
}

export const DEFAULT_SKILLS_STATE: SettingsSkillsState = {
  ...DEFAULT_SKILL_FILTERS,
  selectedPath: null,
};

export interface SkillsBrowserOptions {
  language: Language;
  catalog: SkillCatalog | null;
  loading: boolean;
  error: string;
  state: SettingsSkillsState;
  onChange: (patch: Partial<SettingsSkillsState>) => void;
  onRefresh: () => void;
  loadSkill: (path: string) => Promise<SkillDocument>;
}

const SOURCES: SkillSource[] = [
  "app",
  "kit",
  "opencode",
  "claude",
  "agents",
  "config",
];

/**
 * Read-only skills inventory for Settings.
 *
 * The browser owns the interaction state that must survive a keystroke
 * (query, filters and selection) and reports it upward so a full Settings
 * rebuild can restore the same view. The catalog itself is loaded by the
 * application shell, which keeps this component free of backend details.
 */
export class SkillsBrowser {
  public readonly element: HTMLElement;

  private readonly options: SkillsBrowserOptions;
  private localState: SettingsSkillsState;
  private readonly listView: HTMLElement;
  private readonly detailView: HTMLElement;
  private readonly listBody: HTMLElement;
  private readonly searchInput: HTMLInputElement;
  private readonly scopeSelect: HTMLSelectElement;
  private readonly sourceSelect: HTMLSelectElement;
  private readonly stateSelect: HTMLSelectElement;
  private skillDocument: SkillDocument | null = null;
  private documentLoading = false;
  private documentError = "";
  private documentRequest = 0;

  constructor(options: SkillsBrowserOptions) {
    this.options = options;
    this.localState = { ...options.state };
    this.element = document.createElement("div");
    this.element.className = "skills-browser";
    this.element.dataset.testid = "settings-skills";

    this.searchInput = document.createElement("input");
    this.searchInput.type = "text";
    this.searchInput.className = "skills-search-input";
    this.searchInput.dataset.testid = "skills-search";
    this.searchInput.autocomplete = "off";
    this.searchInput.spellcheck = false;
    this.searchInput.setAttribute("autocorrect", "off");
    this.searchInput.setAttribute("autocapitalize", "off");
    this.searchInput.setAttribute(
      "aria-label",
      t(options.language, "settingsSkillsSearchLabel"),
    );
    this.searchInput.placeholder = t(options.language, "settingsSkillsSearch");
    this.searchInput.value = this.localState.query;
    this.searchInput.oninput = () => {
      this.updateState({ query: this.searchInput.value });
      this.renderListBody();
    };

    this.scopeSelect = this.filterSelect(
      "skills-filter-scope",
      [
        { value: "all", label: t(options.language, "settingsSkillsAllScopes") },
        {
          value: "global",
          label: t(options.language, "settingsSkillsScopeGlobal"),
        },
        {
          value: "project",
          label: t(options.language, "settingsSkillsScopeProject"),
        },
      ],
      this.localState.scope,
      (value) => {
        this.updateState({ scope: value as SkillScopeFilter });
        this.renderListBody();
      },
    );

    this.sourceSelect = this.filterSelect(
      "skills-filter-source",
      [
        { value: "all", label: t(options.language, "settingsSkillsAllSources") },
        ...SOURCES.map((source) => ({
          value: source,
          label: t(options.language, skillSourceLabelKey(source)),
        })),
      ],
      this.localState.source,
      (value) => {
        this.updateState({ source: value as SkillSourceFilter });
        this.renderListBody();
      },
    );

    this.stateSelect = this.filterSelect(
      "skills-filter-state",
      [
        { value: "all", label: t(options.language, "settingsSkillsAllStates") },
        {
          value: "effective",
          label: t(options.language, "settingsSkillsStateEffective"),
        },
        {
          value: "overridden",
          label: t(options.language, "settingsSkillsStateOverridden"),
        },
        {
          value: "invalid",
          label: t(options.language, "settingsSkillsStateInvalid"),
        },
      ],
      this.localState.state,
      (value) => {
        this.updateState({ state: value as SkillStateFilter });
        this.renderListBody();
      },
    );

    this.listBody = document.createElement("div");
    this.listBody.className = "skills-list-body";

    this.listView = this.buildListView();
    this.detailView = document.createElement("div");
    this.detailView.className = "skills-detail-view";
    this.detailView.dataset.testid = "skill-detail";
    this.detailView.hidden = true;

    this.element.append(this.listView, this.detailView);
    this.renderListBody();
    this.syncViews();
    if (this.localState.selectedPath) {
      if (this.selectedSkill()) {
        this.loadDocument(this.localState.selectedPath);
      } else {
        this.renderDetail();
      }
    }
  }

  private buildListView(): HTMLElement {
    const view = document.createElement("div");
    view.className = "skills-list-view";

    const hint = document.createElement("p");
    hint.className = "settings-hint skills-hint";
    hint.textContent = t(this.options.language, "settingsSkillsHint");

    const toolbar = document.createElement("div");
    toolbar.className = "skills-toolbar";

    const search = document.createElement("div");
    search.className = "skills-search";
    const searchIcon = document.createElement("span");
    searchIcon.className = "skills-search-icon";
    searchIcon.appendChild(createIcon("search", 14));
    search.append(searchIcon, this.searchInput);

    const refresh = document.createElement("button");
    refresh.type = "button";
    refresh.className = "toolbar-btn skills-refresh";
    refresh.dataset.testid = "skills-refresh";
    refresh.disabled = this.options.loading;
    refresh.append(
      createIcon("refresh-cw", 14),
      document.createTextNode(
        t(this.options.language, "settingsSkillsRefresh"),
      ),
    );
    refresh.onclick = () => this.options.onRefresh();

    toolbar.append(search, refresh);

    const filters = document.createElement("div");
    filters.className = "skills-filters";
    filters.append(
      this.filterField("settingsSkillsFilterScope", this.scopeSelect),
      this.filterField("settingsSkillsFilterSource", this.sourceSelect),
      this.filterField("settingsSkillsFilterState", this.stateSelect),
    );

    view.append(hint, toolbar, filters, this.listBody);
    return view;
  }

  private filterField(
    labelKey: TranslationKey,
    select: HTMLElement,
  ): HTMLElement {
    const field = document.createElement("label");
    field.className = "skills-filter";
    const label = document.createElement("span");
    label.className = "skills-filter-label";
    label.textContent = t(this.options.language, labelKey);
    field.append(label, select);
    return field;
  }

  private filterSelect(
    testId: string,
    options: Array<{ value: string; label: string }>,
    value: string,
    onChange: (value: string) => void,
  ): HTMLSelectElement {
    const select = document.createElement("select");
    select.className = "skills-filter-select";
    select.dataset.testid = testId;
    for (const option of options) {
      const optionEl = document.createElement("option");
      optionEl.value = option.value;
      optionEl.textContent = option.label;
      select.appendChild(optionEl);
    }
    select.value = value;
    select.onchange = () => onChange(select.value);
    return select;
  }

  private updateState(patch: Partial<SettingsSkillsState>): void {
    this.localState = { ...this.localState, ...patch };
    this.options.onChange(patch);
  }

  private syncViews(): void {
    const viewingDetail = Boolean(this.localState.selectedPath);
    this.listView.hidden = viewingDetail;
    this.detailView.hidden = !viewingDetail;
  }

  private renderListBody(): void {
    const language = this.options.language;
    this.listBody.replaceChildren();

    if (this.options.error) {
      this.listBody.appendChild(
        this.errorBanner(
          this.options.error,
          () => this.options.onRefresh(),
          "skills-error",
        ),
      );
    }

    if (this.options.loading || (!this.options.catalog && !this.options.error)) {
      const loading = document.createElement("div");
      loading.className = "skills-loading";
      loading.dataset.testid = "skills-loading";
      loading.textContent = t(language, "settingsSkillsLoading");
      this.listBody.appendChild(loading);
      return;
    }

    const catalog = this.options.catalog;
    if (!catalog) return;

    if (catalog.skills.length === 0) {
      const empty = document.createElement("div");
      empty.className = "skills-empty";
      empty.dataset.testid = "skills-empty";
      const title = document.createElement("div");
      title.className = "skills-empty-title";
      title.textContent = t(language, "settingsSkillsEmpty");
      const hint = document.createElement("p");
      hint.className = "settings-hint";
      hint.textContent = t(language, "settingsSkillsEmptyHint");
      empty.append(title, hint);
      this.listBody.appendChild(empty);
      this.renderCatalogWarnings(catalog);
      return;
    }

    const skills = filterSkills(catalog.skills, this.localState, language);
    const summary = document.createElement("p");
    summary.className = "skills-summary";
    summary.dataset.testid = "skills-summary";
    summary.textContent =
      skills.length === catalog.skills.length
        ? t(language, "settingsSkillsSummary", {
            count: String(catalog.skills.length),
            active: String(countEffectiveSkills(catalog.skills)),
          })
        : t(language, "settingsSkillsSummaryFiltered", {
            shown: String(skills.length),
            total: String(catalog.skills.length),
            active: String(countEffectiveSkills(skills)),
          });
    this.listBody.appendChild(summary);

    if (skills.length === 0) {
      const empty = document.createElement("div");
      empty.className = "skills-empty";
      empty.dataset.testid = "skills-no-results";
      empty.textContent = t(language, "settingsSkillsNoResults");
      this.listBody.appendChild(empty);
      this.renderCatalogWarnings(catalog);
      return;
    }

    const list = document.createElement("div");
    list.className = "skills-list";
    list.dataset.testid = "skills-list";
    for (const skill of skills) {
      list.appendChild(this.skillCard(skill));
    }
    this.listBody.appendChild(list);
    this.renderCatalogWarnings(catalog);
  }

  private renderCatalogWarnings(catalog: SkillCatalog): void {
    if (catalog.warnings.length === 0) return;
    const details = document.createElement("details");
    details.className = "skills-catalog-warnings";
    const summary = document.createElement("summary");
    summary.textContent = t(
      this.options.language,
      "settingsSkillsCatalogWarnings",
      { count: String(catalog.warnings.length) },
    );
    const list = document.createElement("ul");
    for (const warning of catalog.warnings) {
      const item = document.createElement("li");
      item.textContent = warning;
      list.appendChild(item);
    }
    details.append(summary, list);
    this.listBody.appendChild(details);
  }

  private skillCard(skill: SkillInfo): HTMLElement {
    const language = this.options.language;
    const state = skillState(skill);
    const card = document.createElement("button");
    card.type = "button";
    card.className = "skill-card";
    card.dataset.testid = `skill-card-${skill.id}`;
    card.dataset.skillPath = skill.path;
    card.setAttribute(
      "aria-label",
      t(language, "settingsSkillsOpenSkill", {
        name: localizedSkillName(skill, language),
      }),
    );
    card.onclick = () => this.select(skill.path);

    const head = document.createElement("div");
    head.className = "skill-card-head";
    const name = document.createElement("span");
    name.className = "skill-card-name";
    name.textContent = localizedSkillName(skill, language);
    const badges = document.createElement("span");
    badges.className = "skill-badges";
    badges.append(
      this.badge(
        t(language, skillSourceLabelKey(skill.source)),
        `source-${skill.source}`,
      ),
      this.badge(
        t(language, skillScopeLabelKey(skill.scope)),
        `scope-${skill.scope}`,
      ),
      this.badge(
        t(language, skillStateLabelKey(state)),
        `state-${state}`,
      ),
    );
    head.append(name, badges);

    const description = document.createElement("span");
    const descriptionText = localizedSkillDescription(skill, language);
    description.className = descriptionText
      ? "skill-card-description"
      : "skill-card-description empty";
    description.textContent =
      descriptionText || t(language, "settingsSkillsNoDescription");

    const meta = document.createElement("span");
    meta.className = "skill-card-meta";
    const id = document.createElement("code");
    id.className = "skill-id";
    id.textContent = skill.id;
    const path = document.createElement("span");
    path.className = "skill-path";
    path.title = skill.path;
    path.textContent = skill.path;
    meta.append(id, path);

    card.append(head, description, meta);
    return card;
  }

  private badge(text: string, kind: string): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `skill-badge ${kind}`;
    badge.textContent = text;
    return badge;
  }

  private select(path: string): void {
    if (this.localState.selectedPath === path) return;
    this.updateState({ selectedPath: path });
    this.skillDocument = null;
    this.documentError = "";
    this.syncViews();
    this.loadDocument(path);
  }

  private back(): void {
    const previous = this.localState.selectedPath;
    this.documentRequest += 1;
    this.updateState({ selectedPath: null });
    this.skillDocument = null;
    this.documentLoading = false;
    this.documentError = "";
    this.syncViews();
    this.renderListBody();
    const cards = this.listBody.querySelectorAll<HTMLElement>(".skill-card");
    for (const card of cards) {
      if (card.dataset.skillPath === previous) {
        card.focus();
        break;
      }
    }
  }

  private loadDocument(path: string): void {
    const request = ++this.documentRequest;
    this.documentLoading = true;
    this.documentError = "";
    this.skillDocument = null;
    this.renderDetail();
    void this.options
      .loadSkill(path)
      .then((document) => {
        if (!this.isCurrentDocument(request, path)) return;
        this.skillDocument = document;
      })
      .catch((error: unknown) => {
        if (!this.isCurrentDocument(request, path)) return;
        this.documentError =
          error instanceof Error ? error.message : String(error);
      })
      .finally(() => {
        if (!this.isCurrentDocument(request, path)) return;
        this.documentLoading = false;
        this.renderDetail();
      });
  }

  private isCurrentDocument(request: number, path: string): boolean {
    return (
      request === this.documentRequest && this.localState.selectedPath === path
    );
  }

  private selectedSkill(): SkillInfo | undefined {
    if (!this.localState.selectedPath) return undefined;
    return this.options.catalog?.skills.find(
      (skill) => skill.path === this.localState.selectedPath,
    );
  }

  private renderDetail(): void {
    const language = this.options.language;
    this.detailView.replaceChildren();

    const back = document.createElement("button");
    back.type = "button";
    back.className = "skills-back-btn";
    back.dataset.testid = "skill-detail-back";
    back.append(
      createIcon("chevron-left", 14),
      document.createTextNode(t(language, "settingsSkillsBack")),
    );
    back.onclick = () => this.back();
    this.detailView.appendChild(back);

    const skill = this.selectedSkill();
    if (!skill) {
      const missing = document.createElement("div");
      missing.className = "skills-empty";
      missing.textContent =
        this.options.loading || !this.options.catalog
          ? t(language, "settingsSkillsLoading")
          : t(language, "settingsSkillsNotFound");
      this.detailView.appendChild(missing);
      return;
    }

    const header = document.createElement("div");
    header.className = "skill-detail-header";
    const title = document.createElement("h5");
    title.className = "skill-detail-name";
    title.dataset.testid = "skill-detail-name";
    title.textContent = localizedSkillName(skill, language);
    const id = document.createElement("code");
    id.className = "skill-detail-id";
    id.textContent = skill.id;
    header.append(title, id);
    this.detailView.appendChild(header);

    const description = localizedSkillDescription(skill, language);
    if (description) {
      const text = document.createElement("p");
      text.className = "skill-detail-description";
      text.textContent = description;
      this.detailView.appendChild(text);
    }

    const state = skillState(skill);
    const badges = document.createElement("div");
    badges.className = "skill-badges";
    badges.append(
      this.badge(
        t(language, skillSourceLabelKey(skill.source)),
        `source-${skill.source}`,
      ),
      this.badge(
        t(language, skillScopeLabelKey(skill.scope)),
        `scope-${skill.scope}`,
      ),
      this.badge(t(language, skillStateLabelKey(state)), `state-${state}`),
    );
    this.detailView.appendChild(badges);

    if (!skill.effective && skill.overriddenBy) {
      const overridden = document.createElement("p");
      overridden.className = "skill-detail-notice";
      overridden.dataset.testid = "skill-detail-overridden";
      overridden.textContent = t(language, "settingsSkillsOverriddenBy", {
        path: skill.overriddenBy,
      });
      this.detailView.appendChild(overridden);
    }

    this.detailView.appendChild(this.metadataSection(skill));
    this.detailView.appendChild(this.documentSection(skill));
    this.detailView.appendChild(this.frontmatterSection());
    this.detailView.appendChild(this.supportFilesSection(skill));
    this.detailView.appendChild(this.diagnosticsSection(skill));
  }

  private section(title: string): HTMLElement {
    const section = document.createElement("section");
    section.className = "skill-detail-section";
    const heading = document.createElement("h6");
    heading.className = "skill-detail-section-title";
    heading.textContent = title;
    section.appendChild(heading);
    return section;
  }

  private metadataSection(skill: SkillInfo): HTMLElement {
    const language = this.options.language;
    const section = this.section(t(language, "settingsSkillsDetails"));
    const grid = document.createElement("dl");
    grid.className = "skill-meta-grid";
    const row = (label: string, value: string | HTMLElement) => {
      const term = document.createElement("dt");
      term.textContent = label;
      const detail = document.createElement("dd");
      if (typeof value === "string") {
        detail.textContent = value;
      } else {
        detail.appendChild(value);
      }
      grid.append(term, detail);
    };

    row(t(language, "settingsSkillsDetailId"), skill.id);
    row(
      t(language, "settingsSkillsDetailSource"),
      t(language, skillSourceLabelKey(skill.source)),
    );
    row(
      t(language, "settingsSkillsDetailScope"),
      t(language, skillScopeLabelKey(skill.scope)),
    );
    row(
      t(language, "settingsSkillsDetailFormat"),
      t(
        language,
        skill.format === "directory"
          ? "settingsSkillsFormatDirectory"
          : "settingsSkillsFormatFile",
      ),
    );
    const path = document.createElement("code");
    path.textContent = skill.path;
    row(t(language, "settingsSkillsDetailPath"), path);
    const aliases = localizedSkillAliases(skill, language);
    if (aliases.length > 0) {
      row(t(language, "settingsSkillsDetailAliases"), aliases.join(", "));
    }
    row(
      t(language, "settingsSkillsDetailAutoinvoke"),
      t(
        language,
        skill.autoinvoke ? "settingsSkillsYes" : "settingsSkillsNo",
      ),
    );
    row(
      t(language, "settingsSkillsDetailModelInvocation"),
      t(
        language,
        skill.disableModelInvocation
          ? "settingsSkillsDisabled"
          : "settingsSkillsEnabled",
      ),
    );

    section.appendChild(grid);
    return section;
  }

  private documentSection(skill: SkillInfo): HTMLElement {
    const language = this.options.language;
    const section = this.section(t(language, "settingsSkillsRendered"));
    if (this.documentLoading) {
      const loading = document.createElement("p");
      loading.className = "settings-hint";
      loading.dataset.testid = "skill-detail-loading";
      loading.textContent = t(language, "settingsSkillsLoadingDocument");
      section.appendChild(loading);
      return section;
    }
    if (this.documentError) {
      section.appendChild(
        this.errorBanner(
          `${t(language, "settingsSkillsDocumentError")} ${this.documentError}`,
          () => this.loadDocument(skill.path),
          "skill-detail-error",
        ),
      );
      return section;
    }
    if (!this.skillDocument) return section;
    if (!this.skillDocument.body.trim()) {
      const empty = document.createElement("p");
      empty.className = "settings-hint";
      empty.textContent = t(language, "settingsSkillsBodyEmpty");
      section.appendChild(empty);
      return section;
    }
    const body = document.createElement("div");
    body.className = "skill-detail-markdown markdown-preview";
    body.dataset.testid = "skill-detail-markdown";
    body.innerHTML = renderMarkdownPreview(this.skillDocument.body);
    section.appendChild(body);
    return section;
  }

  private frontmatterSection(): HTMLElement {
    const language = this.options.language;
    const section = this.section(t(language, "settingsSkillsFrontmatter"));
    if (this.documentLoading) {
      const loading = document.createElement("p");
      loading.className = "settings-hint";
      loading.textContent = t(language, "settingsSkillsLoadingDocument");
      section.appendChild(loading);
      return section;
    }
    if (!this.skillDocument) return section;
    const raw = this.skillDocument.frontmatter.trim();
    if (!raw) {
      const empty = document.createElement("p");
      empty.className = "settings-hint";
      empty.textContent = t(language, "settingsSkillsFrontmatterEmpty");
      section.appendChild(empty);
      return section;
    }
    const pre = document.createElement("pre");
    pre.className = "skill-frontmatter";
    pre.dataset.testid = "skill-detail-frontmatter";
    pre.textContent = `---\n${raw}\n---`;
    section.appendChild(pre);
    return section;
  }

  private supportFilesSection(skill: SkillInfo): HTMLElement {
    const language = this.options.language;
    const section = this.section(t(language, "settingsSkillsSupportFiles"));
    if (skill.files.length === 0) {
      const empty = document.createElement("p");
      empty.className = "settings-hint";
      empty.textContent = t(language, "settingsSkillsNoSupportFiles");
      section.appendChild(empty);
      return section;
    }
    const list = document.createElement("ul");
    list.className = "skill-file-list";
    list.dataset.testid = "skill-detail-files";
    for (const file of skill.files) {
      const item = document.createElement("li");
      const code = document.createElement("code");
      code.textContent = file;
      item.appendChild(code);
      list.appendChild(item);
    }
    section.appendChild(list);
    return section;
  }

  private diagnosticsSection(skill: SkillInfo): HTMLElement {
    const language = this.options.language;
    const section = this.section(t(language, "settingsSkillsDiagnostics"));
    if (skill.valid && skill.warnings.length === 0) {
      const valid = document.createElement("p");
      valid.className = "skill-valid";
      valid.textContent = t(language, "settingsSkillsValid");
      section.appendChild(valid);
      return section;
    }
    if (skill.errors.length > 0) {
      section.appendChild(
        this.messageList(
          t(language, "settingsSkillsErrors"),
          skill.errors,
          "skill-errors",
          "skill-detail-errors",
        ),
      );
    }
    if (skill.warnings.length > 0) {
      section.appendChild(
        this.messageList(
          t(language, "settingsSkillsWarnings"),
          skill.warnings,
          "skill-warnings",
          "skill-detail-warnings",
        ),
      );
    }
    return section;
  }

  private messageList(
    title: string,
    messages: string[],
    className: string,
    testId: string,
  ): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = `skill-message-list ${className}`;
    wrap.dataset.testid = testId;
    const heading = document.createElement("strong");
    heading.textContent = title;
    const list = document.createElement("ul");
    for (const message of messages) {
      const item = document.createElement("li");
      item.textContent = message;
      list.appendChild(item);
    }
    wrap.append(heading, list);
    return wrap;
  }

  private errorBanner(
    message: string,
    retry: () => void,
    testId: string,
  ): HTMLElement {
    const banner = document.createElement("div");
    banner.className = "error-banner skills-error-banner";
    banner.dataset.testid = testId;
    const text = document.createElement("span");
    text.textContent = message;
    const action = document.createElement("button");
    action.type = "button";
    action.className = "versions-link-btn";
    action.textContent = t(this.options.language, "settingsSkillsRetry");
    action.onclick = retry;
    banner.append(text, action);
    return banner;
  }
}
