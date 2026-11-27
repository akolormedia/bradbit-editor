import { describe, expect, it } from "vitest";
import { SkillInfo } from "../types";
import {
  DEFAULT_SKILL_FILTERS,
  availableSkillSources,
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

describe("skills helpers (T-3.15.2)", () => {
  it("uses localized names, descriptions and aliases when present", () => {
    const localized = skill({
      i18n: {
        es: {
          name: "Revisión",
          description: "Revisa un borrador",
          aliases: ["revisar"],
        },
      },
      aliases: ["check"],
    });
    expect(localizedSkillName(localized, "es")).toBe("Revisión");
    expect(localizedSkillDescription(localized, "es")).toBe(
      "Revisa un borrador",
    );
    expect(localizedSkillAliases(localized, "es")).toEqual(["revisar"]);
    expect(localizedSkillName(localized, "en")).toBe("Review");
    expect(localizedSkillDescription(localized, "en")).toBe("Review a draft");
    expect(localizedSkillAliases(localized, "en")).toEqual(["check"]);
  });

  it("falls back to the ID when a skill has no name", () => {
    expect(localizedSkillName(skill({ name: "  " }), "es")).toBe("review");
  });

  it("reports one headline state, prioritizing invalid skills", () => {
    expect(skillState(skill())).toBe("effective");
    expect(skillState(skill({ effective: false }))).toBe("overridden");
    expect(
      skillState(skill({ valid: false, errors: ["Broken"] })),
    ).toBe("invalid");
    expect(
      skillState(skill({ valid: false, effective: false })),
    ).toBe("invalid");
  });

  it("filters by canonical ID, path, localized text and aliases", () => {
    const skills = [
      skill(),
      skill({
        id: "git-release",
        name: "Git Release",
        description: "Prepare a release",
        path: "/skills/git-release/SKILL.md",
        relativePath: "git-release/SKILL.md",
        aliases: ["release"],
        source: "kit",
        scope: "project",
      }),
      skill({
        id: "voz",
        name: "Voice",
        description: "Voice notes",
        i18n: {
          es: {
            name: "Voz",
            description: "Notas de voz",
            aliases: ["tono"],
          },
        },
        source: "claude",
      }),
    ];

    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, query: "release" }, "es").map(
        (item) => item.id,
      ),
    ).toEqual(["git-release"]);
    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, query: "tono" }, "es").map(
        (item) => item.id,
      ),
    ).toEqual(["voz"]);
    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, query: "notas" }, "es").map(
        (item) => item.id,
      ),
    ).toEqual(["voz"]);
    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, query: "SKILL.md" }, "es")
        .length,
    ).toBe(3);
  });

  it("filters by scope, source and headline state", () => {
    const skills = [
      skill(),
      skill({ id: "kit-skill", source: "kit", scope: "project" }),
      skill({
        id: "overridden",
        source: "opencode",
        effective: false,
        overriddenBy: "/project/.bradbit/skills/overridden/SKILL.md",
      }),
      skill({ id: "broken", valid: false, errors: ["Invalid YAML"] }),
    ];

    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, scope: "project" }, "es")
        .map((item) => item.id),
    ).toEqual(["kit-skill"]);
    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, source: "opencode" }, "es")
        .map((item) => item.id),
    ).toEqual(["overridden"]);
    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, state: "overridden" }, "es")
        .map((item) => item.id),
    ).toEqual(["overridden"]);
    expect(
      filterSkills(skills, { ...DEFAULT_SKILL_FILTERS, state: "invalid" }, "es")
        .map((item) => item.id),
    ).toEqual(["broken"]);
  });

  it("counts effective skills and lists sources in display order", () => {
    const skills = [
      skill(),
      skill({ id: "broken", valid: false, errors: ["Broken"] }),
      skill({ id: "kit-skill", source: "kit", scope: "project" }),
      skill({ id: "claude-skill", source: "claude" }),
    ];
    expect(countEffectiveSkills(skills)).toBe(3);
    expect(availableSkillSources(skills)).toEqual(["app", "kit", "claude"]);
  });

  it("maps sources, scopes and states to translation keys", () => {
    expect(skillSourceLabelKey("app")).toBe("settingsSkillsSourceApp");
    expect(skillSourceLabelKey("opencode")).toBe(
      "settingsSkillsSourceOpencode",
    );
    expect(skillScopeLabelKey("project")).toBe(
      "settingsSkillsScopeProject",
    );
    expect(skillStateLabelKey("invalid")).toBe(
      "settingsSkillsStateInvalid",
    );
  });
});
