// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillCatalog, SkillDocument, SkillInfo } from "../types";
import {
  DEFAULT_SKILLS_STATE,
  SkillsBrowser,
  SkillsBrowserOptions,
  SettingsSkillsState,
} from "./skillsPanel";

function skill(overrides: Partial<SkillInfo> = {}): SkillInfo {
  return {
    id: "review",
    name: "Review",
    description: "Review a draft",
    aliases: [],
    i18n: {},
    source: "app",
    scope: "global",
    path: "/skills/review/SKILL.md",
    root: "/skills",
    relativePath: "review/SKILL.md",
    format: "directory",
    valid: true,
    errors: [],
    warnings: [],
    autoinvoke: true,
    disableModelInvocation: false,
    files: [],
    effective: true,
    overriddenBy: null,
    ...overrides,
  };
}

const REVIEW = skill();
const RELEASE = skill({
  id: "git-release",
  name: "Git Release",
  description: "Prepare a release",
  source: "kit",
  scope: "project",
  path: "/project/.bradbit/skills/git-release/SKILL.md",
  root: "/project/.bradbit/skills",
  relativePath: "git-release/SKILL.md",
  aliases: ["release"],
});
const BROKEN = skill({
  id: "broken",
  name: "Broken",
  description: "",
  path: "/skills/broken/SKILL.md",
  root: "/skills",
  relativePath: "broken/SKILL.md",
  valid: false,
  errors: ["Invalid frontmatter"],
  warnings: ["Missing description"],
});
const OVERRIDDEN = skill({
  id: "review",
  name: "Review from OpenCode",
  source: "opencode",
  path: "/project/.opencode/skills/review/SKILL.md",
  root: "/project/.opencode/skills",
  effective: false,
  overriddenBy: REVIEW.path,
});

function catalog(skills: SkillInfo[] = [REVIEW, RELEASE, BROKEN, OVERRIDDEN]): SkillCatalog {
  return { skills, warnings: [] };
}

function documentFor(info: SkillInfo): SkillDocument {
  return {
    info,
    frontmatter: "name: Review\ndescription: Review a draft\n",
    body: "# Review\n\nCheck the draft.\n",
  };
}

function options(
  overrides: Partial<SkillsBrowserOptions> = {},
): SkillsBrowserOptions {
  return {
    language: "es",
    catalog: catalog(),
    loading: false,
    error: "",
    state: { ...DEFAULT_SKILLS_STATE },
    onChange: vi.fn(),
    onRefresh: vi.fn(),
    loadSkill: vi.fn(async (path: string) => {
      const info = catalog().skills.find((item) => item.path === path) ?? REVIEW;
      return documentFor(info);
    }),
    ...overrides,
  };
}

function mount(opts: SkillsBrowserOptions = options()): SkillsBrowser {
  const browser = new SkillsBrowser(opts);
  document.body.appendChild(browser.element);
  return browser;
}

function card(root: HTMLElement, path: string): HTMLButtonElement | undefined {
  return [...root.querySelectorAll<HTMLButtonElement>(".skill-card")].find(
    (item) => item.dataset.skillPath === path,
  );
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("skills browser (T-3.15.2)", () => {
  it("lists skills with source, scope, state and canonical metadata", () => {
    const browser = mount();

    expect(
      browser.element.querySelectorAll(".skill-card").length,
    ).toBe(4);
    const review = card(browser.element, REVIEW.path)!;
    expect(review.textContent).toContain("Review");
    expect(review.textContent).toContain("Review a draft");
    expect(review.textContent).toContain("Bradbit");
    expect(review.textContent).toContain("Global");
    expect(review.textContent).toContain("Activa");
    expect(review.querySelector(".skill-id")?.textContent).toBe("review");
    expect(review.querySelector(".skill-path")?.textContent).toBe(REVIEW.path);

    const release = card(browser.element, RELEASE.path)!;
    expect(release.textContent).toContain("Kit");
    expect(release.textContent).toContain("Proyecto");

    const overridden = card(browser.element, OVERRIDDEN.path)!;
    expect(overridden.textContent).toContain("Reemplazada");

    const broken = card(browser.element, BROKEN.path)!;
    expect(broken.textContent).toContain("Inválida");
    expect(broken.textContent).toContain(
      "Sin descripción: el agente no la verá en su lista.",
    );
  });

  it("filters by text, scope, source and state", () => {
    const onChange = vi.fn();
    const browser = mount(options({ onChange }));
    const search = browser.element.querySelector<HTMLInputElement>(
      '[data-testid="skills-search"]',
    )!;

    search.value = "release";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onChange).toHaveBeenCalledWith({ query: "release" });
    expect(
      [...browser.element.querySelectorAll(".skill-card")].map(
        (item) => (item as HTMLElement).dataset.skillPath,
      ),
    ).toEqual([RELEASE.path]);

    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const scope = browser.element.querySelector<HTMLSelectElement>(
      '[data-testid="skills-filter-scope"]',
    )!;
    scope.value = "project";
    scope.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      [...browser.element.querySelectorAll(".skill-card")].map(
        (item) => (item as HTMLElement).dataset.skillPath,
      ),
    ).toEqual([RELEASE.path]);

    scope.value = "all";
    scope.dispatchEvent(new Event("change", { bubbles: true }));
    const state = browser.element.querySelector<HTMLSelectElement>(
      '[data-testid="skills-filter-state"]',
    )!;
    state.value = "invalid";
    state.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      [...browser.element.querySelectorAll(".skill-card")].map(
        (item) => (item as HTMLElement).dataset.skillPath,
      ),
    ).toEqual([BROKEN.path]);

    search.value = "zzz";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(
      browser.element.querySelector('[data-testid="skills-no-results"]'),
    ).not.toBeNull();
  });

  it("opens the detail with rendered SKILL.md, frontmatter and support files", async () => {
    const onChange = vi.fn();
    const loadSkill = vi.fn(async () =>
      documentFor(
        skill({
          files: ["references/policy.md", "templates/review.md"],
        }),
      ),
    );
    const browser = mount(
      options({
        onChange,
        loadSkill,
        catalog: catalog([
          skill({ files: ["references/policy.md", "templates/review.md"] }),
        ]),
      }),
    );

    card(browser.element, REVIEW.path)!.click();
    expect(onChange).toHaveBeenCalledWith({ selectedPath: REVIEW.path });
    expect(
      browser.element.querySelector('[data-testid="skill-detail-loading"]'),
    ).not.toBeNull();

    await vi.waitFor(() => {
      expect(
        browser.element.querySelector('[data-testid="skill-detail-markdown"]'),
      ).not.toBeNull();
    });
    const detail = browser.element.querySelector(
      '[data-testid="skill-detail"]',
    )!;
    expect(detail.textContent).toContain("Review");
    expect(detail.querySelector("h1")?.textContent).toBe("Review");
    expect(
      detail.querySelector('[data-testid="skill-detail-frontmatter"]')
        ?.textContent,
    ).toContain("name: Review");
    expect(
      detail.querySelector('[data-testid="skill-detail-files"]')?.textContent,
    ).toContain("references/policy.md");
    expect(detail.textContent).toContain("SKILL.md");
    expect(detail.textContent).toContain(REVIEW.path);
  });

  it("shows override and validation diagnostics", async () => {
    const browser = mount(
      options({
        catalog: catalog([OVERRIDDEN]),
        loadSkill: async () => documentFor(OVERRIDDEN),
      }),
    );
    card(browser.element, OVERRIDDEN.path)!.click();
    await vi.waitFor(() =>
      expect(
        browser.element.querySelector(
          '[data-testid="skill-detail-overridden"]',
        ),
      ).not.toBeNull(),
    );
    expect(
      browser.element.querySelector('[data-testid="skill-detail-overridden"]')
        ?.textContent,
    ).toContain(REVIEW.path);

    document.body.innerHTML = "";
    const broken = mount(
      options({
        catalog: catalog([BROKEN]),
        loadSkill: async () => documentFor(BROKEN),
      }),
    );
    card(broken.element, BROKEN.path)!.click();
    await vi.waitFor(() =>
      expect(
        broken.element.querySelector('[data-testid="skill-detail-errors"]'),
      ).not.toBeNull(),
    );
    expect(
      broken.element.querySelector('[data-testid="skill-detail-errors"]')
        ?.textContent,
    ).toContain("Invalid frontmatter");
    expect(
      broken.element.querySelector('[data-testid="skill-detail-warnings"]')
        ?.textContent,
    ).toContain("Missing description");
  });

  it("returns to the list and restores focus to the selected card", () => {
    const onChange = vi.fn();
    const browser = mount(options({ onChange }));
    const target = card(browser.element, REVIEW.path)!;
    target.click();

    browser.element
      .querySelector<HTMLButtonElement>('[data-testid="skill-detail-back"]')!
      .click();

    expect(onChange).toHaveBeenCalledWith({ selectedPath: null });
    expect(
      browser.element.querySelector<HTMLElement>('[data-testid="skills-list"]')
        ?.hidden,
    ).toBe(false);
    expect(document.activeElement).toBe(card(browser.element, REVIEW.path));
  });

  it("restores a persisted selection when the panel is rebuilt", async () => {
    const loadSkill = vi.fn(async () => documentFor(REVIEW));
    const browser = mount(
      options({
        state: { ...DEFAULT_SKILLS_STATE, selectedPath: REVIEW.path },
        loadSkill,
      }),
    );

    await vi.waitFor(() => {
      expect(
        browser.element.querySelector('[data-testid="skill-detail-markdown"]'),
      ).not.toBeNull();
    });
    expect(loadSkill).toHaveBeenCalledWith(REVIEW.path);
    expect(
      browser.element.querySelector<HTMLElement>(".skills-list-view")?.hidden,
    ).toBe(true);
  });

  it("shows loading, error and empty states", () => {
    const loading = mount(options({ catalog: null, loading: true }));
    expect(
      loading.element.querySelector('[data-testid="skills-loading"]'),
    ).not.toBeNull();

    document.body.innerHTML = "";
    const onRefresh = vi.fn();
    const failed = mount(
      options({ catalog: null, error: "boom", onRefresh }),
    );
    const banner = failed.element.querySelector<HTMLElement>(
      '[data-testid="skills-error"]',
    )!;
    expect(banner.textContent).toContain("boom");
    banner.querySelector<HTMLButtonElement>("button")!.click();
    expect(onRefresh).toHaveBeenCalled();

    document.body.innerHTML = "";
    const empty = mount(options({ catalog: catalog([]) }));
    expect(
      empty.element.querySelector('[data-testid="skills-empty"]'),
    ).not.toBeNull();
  });

  it("shows catalog warnings and a missing selection notice", () => {
    const browser = mount(
      options({
        catalog: {
          skills: [REVIEW],
          warnings: ["Remote catalogs are not supported yet: https://x.test"],
        },
      }),
    );
    expect(browser.element.textContent).toContain(
      "Remote catalogs are not supported yet",
    );

    document.body.innerHTML = "";
    const missing = mount(
      options({
        state: {
          ...DEFAULT_SKILLS_STATE,
          selectedPath: "/gone/SKILL.md",
        } as SettingsSkillsState,
      }),
    );
    expect(missing.element.textContent).toContain(
      "Esta skill ya no forma parte del inventario.",
    );
  });

  it("refreshes the inventory from the toolbar", () => {
    const onRefresh = vi.fn();
    const browser = mount(options({ onRefresh }));
    browser.element
      .querySelector<HTMLButtonElement>('[data-testid="skills-refresh"]')!
      .click();
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
