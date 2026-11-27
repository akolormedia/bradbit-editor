import { t, TranslationKey } from "../i18n";
import { Language, SkillInfo, SkillSource } from "../types";
import { normalizeSettingsSearch } from "./catalog";

export type SkillScopeFilter = "all" | "global" | "project";
export type SkillSourceFilter = "all" | SkillSource;
export type SkillStateFilter = "all" | "effective" | "overridden" | "invalid";
export type SkillState = "effective" | "overridden" | "invalid";

export interface SkillFilters {
  query: string;
  scope: SkillScopeFilter;
  source: SkillSourceFilter;
  state: SkillStateFilter;
}

export const DEFAULT_SKILL_FILTERS: SkillFilters = {
  query: "",
  scope: "all",
  source: "all",
  state: "all",
};

/**
 * A skill has exactly one headline state. When a duplicate is invalid we show
 * "invalid" first, because fixing it matters more than its source precedence.
 */
export function skillState(skill: SkillInfo): SkillState {
  if (!skill.valid) return "invalid";
  return skill.effective ? "effective" : "overridden";
}

export function localizedSkillName(
  skill: SkillInfo,
  language: Language,
): string {
  const localized = skill.i18n?.[language]?.name?.trim();
  return localized || skill.name.trim() || skill.id;
}

export function localizedSkillDescription(
  skill: SkillInfo,
  language: Language,
): string {
  const localized = skill.i18n?.[language]?.description?.trim();
  return localized || skill.description.trim();
}

export function localizedSkillAliases(
  skill: SkillInfo,
  language: Language,
): string[] {
  const localized = skill.i18n?.[language]?.aliases?.filter(Boolean) ?? [];
  return localized.length > 0 ? localized : (skill.aliases ?? []).filter(Boolean);
}

function searchableText(skill: SkillInfo, language: Language): string {
  return [
    skill.id,
    skill.name,
    skill.description,
    skill.path,
    skill.relativePath,
    skill.root,
    skill.source,
    skill.scope,
    t(language, skillSourceLabelKey(skill.source)),
    t(language, skillScopeLabelKey(skill.scope)),
    t(language, skillStateLabelKey(skillState(skill))),
    localizedSkillName(skill, language),
    localizedSkillDescription(skill, language),
    ...localizedSkillAliases(skill, language),
    ...(skill.files ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function filterSkills(
  skills: SkillInfo[],
  filters: SkillFilters,
  language: Language,
): SkillInfo[] {
  const query = normalizeSettingsSearch(filters.query);
  return skills.filter((skill) => {
    if (filters.scope !== "all" && skill.scope !== filters.scope) return false;
    if (filters.source !== "all" && skill.source !== filters.source) {
      return false;
    }
    if (filters.state !== "all" && skillState(skill) !== filters.state) {
      return false;
    }
    if (!query) return true;
    return normalizeSettingsSearch(searchableText(skill, language)).includes(
      query,
    );
  });
}

export function skillSourceLabelKey(source: SkillSource): TranslationKey {
  switch (source) {
    case "app":
      return "settingsSkillsSourceApp";
    case "opencode":
      return "settingsSkillsSourceOpencode";
    case "claude":
      return "settingsSkillsSourceClaude";
    case "agents":
      return "settingsSkillsSourceAgents";
    case "kit":
      return "settingsSkillsSourceKit";
    case "config":
      return "settingsSkillsSourceConfig";
    default:
      return "settingsSkillsSourceOther";
  }
}

export function skillScopeLabelKey(
  scope: SkillInfo["scope"],
): TranslationKey {
  return scope === "project"
    ? "settingsSkillsScopeProject"
    : "settingsSkillsScopeGlobal";
}

export function skillStateLabelKey(state: SkillState): TranslationKey {
  switch (state) {
    case "effective":
      return "settingsSkillsStateEffective";
    case "overridden":
      return "settingsSkillsStateOverridden";
    case "invalid":
      return "settingsSkillsStateInvalid";
  }
}

export function countEffectiveSkills(skills: SkillInfo[]): number {
  return skills.filter((skill) => skill.effective && skill.valid).length;
}

export function availableSkillSources(skills: SkillInfo[]): SkillSource[] {
  const order: SkillSource[] = [
    "app",
    "kit",
    "opencode",
    "claude",
    "agents",
    "config",
  ];
  const present = new Set(skills.map((skill) => skill.source));
  return order.filter((source) => present.has(source));
}
