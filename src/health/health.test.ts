import { describe, expect, it } from "vitest";
import { ByokProvider, GitEngineStatus, TemplateInfo } from "../types";
import { buildHealthReport } from "./health";

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
  { id: "blank", name: "Blank", description: "", source: "blank" },
];

describe("first-run health report (T-3.5.4)", () => {
  it("reports four ready checks when everything is available", () => {
    const report = buildHealthReport({
      runtime: true,
      git,
      providers: [provider],
      templates,
    });
    expect(report.ready).toBe(true);
    expect(report.canWrite).toBe(true);
    expect(report.okCount).toBe(4);
    expect(report.total).toBe(4);
    expect(report.checks.map((check) => check.level)).toEqual([
      "ok",
      "ok",
      "ok",
      "ok",
    ]);
    expect(report.checks.find((check) => check.id === "git")?.detailParams).toEqual({
      version: "libgit2 1.9.7",
    });
  });

  it("keeps writing available without an AI provider and offers Settings", () => {
    const report = buildHealthReport({
      runtime: true,
      git,
      providers: [],
      templates,
    });
    const ai = report.checks.find((check) => check.id === "ai");
    expect(report.ready).toBe(true);
    expect(report.canWrite).toBe(true);
    expect(ai?.level).toBe("missing");
    expect(ai?.required).toBe(false);
    expect(ai?.action?.id).toBe("models");
  });

  it("reports missing runtime, Git and templates with actions", () => {
    const report = buildHealthReport({
      runtime: false,
      git: null,
      providers: [],
      templates: [],
    });
    expect(report.ready).toBe(false);
    expect(report.canWrite).toBe(true);
    expect(report.checks.find((check) => check.id === "runtime")?.level).toBe(
      "missing",
    );
    expect(report.checks.find((check) => check.id === "git")?.level).toBe(
      "unknown",
    );
    expect(report.checks.find((check) => check.id === "templates")?.action?.id).toBe(
      "new-project",
    );
  });

  it("distinguishes unknown checks from definitive failures", () => {
    const report = buildHealthReport({
      runtime: null,
      git: null,
      providers: [provider],
      templates: null,
    });
    expect(report.ready).toBe(false);
    expect(report.checks.map((check) => check.level)).toEqual([
      "unknown",
      "unknown",
      "ok",
      "unknown",
    ]);
  });

  it("shows the first provider and how many more are configured", () => {
    const second: ByokProvider = {
      id: "openai",
      name: "OpenAI",
      kind: "openai",
      model: "gpt-4.1",
      envVar: "OPENAI_API_KEY",
    };
    const report = buildHealthReport({
      runtime: true,
      git,
      providers: [provider, second],
      templates,
    });
    const ai = report.checks.find((check) => check.id === "ai");
    expect(ai?.detailKey).toBe("healthAiReadyModelMore");
    expect(ai?.detailParams).toMatchObject({
      name: "DeepSeek",
      model: "deepseek-chat",
      count: "1",
    });
  });
});
