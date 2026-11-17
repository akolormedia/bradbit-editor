import type { TranslationKey } from "../i18n";
import { ByokProvider, GitEngineStatus, TemplateInfo } from "../types";

export type HealthLevel = "ok" | "missing" | "unknown";

export type HealthActionId = "models" | "new-project";

export interface HealthAction {
  id: HealthActionId;
  labelKey: TranslationKey;
}

export interface HealthCheck {
  id: "runtime" | "git" | "ai" | "templates";
  /** Required for writing; AI is intentionally optional. */
  required: boolean;
  level: HealthLevel;
  titleKey: TranslationKey;
  detailKey: TranslationKey;
  detailParams?: Record<string, string>;
  action?: HealthAction;
}

export interface HealthReport {
  checks: HealthCheck[];
  okCount: number;
  total: number;
  /** Runtime + Git + templates are ready. AI is not required to write. */
  ready: boolean;
  /** Opening a folder and writing never depends on the AI provider. */
  canWrite: boolean;
}

export interface HealthInput {
  /** `null` means the check could not run. */
  runtime: boolean | null;
  git: GitEngineStatus | null;
  providers: ByokProvider[];
  templates: TemplateInfo[] | null;
}

function runtimeCheck(found: boolean | null): HealthCheck {
  if (found === true) {
    return {
      id: "runtime",
      required: true,
      level: "ok",
      titleKey: "healthRuntime",
      detailKey: "healthRuntimeReady",
    };
  }
  if (found === false) {
    return {
      id: "runtime",
      required: true,
      level: "missing",
      titleKey: "healthRuntime",
      detailKey: "healthRuntimeMissing",
    };
  }
  return {
    id: "runtime",
    required: true,
    level: "unknown",
    titleKey: "healthRuntime",
    detailKey: "healthUnknown",
  };
}

function gitCheck(git: GitEngineStatus | null): HealthCheck {
  if (git?.supported) {
    return {
      id: "git",
      required: true,
      level: "ok",
      titleKey: "healthGit",
      detailKey: "healthGitReady",
      detailParams: { version: git.raw },
    };
  }
  return {
    id: "git",
    required: true,
    level: git ? "missing" : "unknown",
    titleKey: "healthGit",
    detailKey: git ? "healthGitMissing" : "healthUnknown",
  };
}

function aiCheck(providers: ByokProvider[]): HealthCheck {
  if (providers.length === 0) {
    return {
      id: "ai",
      required: false,
      level: "missing",
      titleKey: "healthAi",
      detailKey: "healthAiMissing",
      action: { id: "models", labelKey: "healthAiAction" },
    };
  }
  const first = providers[0];
  const model = first.model?.trim() ?? "";
  const hasModel = model.length > 0 && model !== first.name;
  const multiple = providers.length > 1;
  const detailKey = multiple
    ? hasModel
      ? "healthAiReadyModelMore"
      : "healthAiReadyMore"
    : hasModel
      ? "healthAiReadyModel"
      : "healthAiReady";
  return {
    id: "ai",
    required: false,
    level: "ok",
    titleKey: "healthAi",
    detailKey,
    detailParams: {
      name: first.name,
      ...(hasModel ? { model } : {}),
      ...(multiple ? { count: String(providers.length - 1) } : {}),
    },
  };
}

function templatesCheck(templates: TemplateInfo[] | null): HealthCheck {
  if (templates === null) {
    return {
      id: "templates",
      required: true,
      level: "unknown",
      titleKey: "healthTemplates",
      detailKey: "healthUnknown",
    };
  }
  if (templates.length === 0) {
    return {
      id: "templates",
      required: true,
      level: "missing",
      titleKey: "healthTemplates",
      detailKey: "healthTemplatesMissing",
      action: { id: "new-project", labelKey: "healthTemplatesAction" },
    };
  }
  return {
    id: "templates",
    required: true,
    level: "ok",
    titleKey: "healthTemplates",
    detailKey: "healthTemplatesReady",
    detailParams: { count: String(templates.length) },
  };
}

/**
 * Builds the first-run health report. AI is shown and actionable but is never
 * a prerequisite: `canWrite` is always true, even without a provider.
 */
export function buildHealthReport(input: HealthInput): HealthReport {
  const checks = [
    runtimeCheck(input.runtime),
    gitCheck(input.git),
    aiCheck(input.providers),
    templatesCheck(input.templates),
  ];
  return {
    checks,
    okCount: checks.filter((check) => check.level === "ok").length,
    total: checks.length,
    ready: checks
      .filter((check) => check.required)
      .every((check) => check.level === "ok"),
    canWrite: true,
  };
}
