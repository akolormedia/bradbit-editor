// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { ByokProvider, GitEngineStatus, Language, TemplateInfo } from "../types";
import { buildHealthReport } from "./health";
import { createHealthPanel } from "./healthPanel";

const git: GitEngineStatus = {
  major: 1,
  minor: 9,
  patch: 7,
  raw: "libgit2 1.9.7",
  supported: true,
};

const provider: ByokProvider = {
  id: "deepseek",
  name: "DeepSeek",
  kind: "deepseek",
  model: "deepseek-chat",
  envVar: "DEEPSEEK_API_KEY",
};

const templates: TemplateInfo[] = [
  {
    id: "guionista-kit",
    name: "Screenwriting",
    description: "",
    source: "bundled",
  },
];

function panel(
  options: {
    language?: Language;
    report?: ReturnType<typeof buildHealthReport> | null;
    loading?: boolean;
    onAction?: (action: "models" | "new-project" | "refresh") => void;
  } = {},
) {
  const element = createHealthPanel({
    language: options.language ?? "es",
    report:
      options.report === undefined
        ? buildHealthReport({
            runtime: true,
            git,
            providers: [],
            templates,
          })
        : options.report,
    loading: options.loading ?? false,
    onAction: options.onAction ?? (() => {}),
  });
  document.body.appendChild(element);
  return element;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("first-run health panel (T-3.5.4)", () => {
  it("renders checks and connects a missing model through Settings", () => {
    const onAction = vi.fn();
    const element = panel({ onAction });

    expect(element.dataset.testid).toBe("health-card");
    expect(
      element.querySelector('[data-testid="health-check-runtime"]')
        ?.getAttribute("data-level"),
    ).toBe("ok");
    expect(
      element.querySelector('[data-testid="health-check-ai"]')
        ?.getAttribute("data-level"),
    ).toBe("missing");

    const connect = element.querySelector<HTMLButtonElement>(
      '[data-testid="health-action-models"]',
    );
    expect(connect).not.toBeNull();
    connect!.click();
    expect(onAction).toHaveBeenCalledWith("models");
  });

  it("offers a new project when templates are missing", () => {
    const onAction = vi.fn();
    const element = panel({
      report: buildHealthReport({
        runtime: true,
        git,
        providers: [provider],
        templates: [],
      }),
      onAction,
    });
    element
      .querySelector<HTMLButtonElement>(
        '[data-testid="health-action-new-project"]',
      )!
      .click();
    expect(onAction).toHaveBeenCalledWith("new-project");
  });

  it("is non-blocking: there is no modal backdrop and writing is allowed", () => {
    const report = buildHealthReport({
      runtime: true,
      git,
      providers: [],
      templates,
    });
    const element = panel({ report });
    expect(report.canWrite).toBe(true);
    expect(document.querySelector(".modal-backdrop")).toBeNull();
    expect(element.querySelector(".health-note")?.textContent).toContain(
      "no depende del modelo",
    );
  });

  it("shows a loading state and disables refresh while checking", () => {
    const element = panel({ report: null, loading: true });
    expect(
      element.querySelector('[data-testid="health-checking"]'),
    ).not.toBeNull();
    expect(
      element.querySelector<HTMLButtonElement>(
        '[data-testid="health-refresh"]',
      )?.disabled,
    ).toBe(true);
  });

  it("shows an actionable error when the report is unavailable", () => {
    const onAction = vi.fn();
    const element = panel({ report: null, onAction });
    expect(element.querySelector('[data-testid="health-error"]')).not.toBeNull();
    element
      .querySelector<HTMLButtonElement>('[data-testid="health-refresh"]')!
      .click();
    expect(onAction).toHaveBeenCalledWith("refresh");
  });

  it("celebrates a ready environment", () => {
    const element = panel({
      report: buildHealthReport({
        runtime: true,
        git,
        providers: [provider],
        templates,
      }),
    });
    const badge = element.querySelector(".health-badge");
    expect(badge?.classList.contains("ok")).toBe(true);
    expect(badge?.textContent).toContain("Listo para escribir");
  });

  it("stays compact without a duplicated intro", () => {
    const element = panel();
    expect(element.querySelector(".health-intro")).toBeNull();
    expect(element.querySelector(".health-checks")).not.toBeNull();
    expect(
      element.querySelector('[data-testid="health-check-runtime"]')?.textContent,
    ).toContain("Motor Bradbit");
  });
});
