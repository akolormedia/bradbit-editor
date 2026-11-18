import { describe, expect, it } from "vitest";
import {
  globToRegExp,
  matchesAnySource,
  matchesGlob,
  parseContributionManifest,
  symbolSourcesForLanguage,
} from "./manifest";

describe("contribution manifest", () => {
  it("parses declarative symbol sources and ignores invalid entries", () => {
    const manifest = parseContributionManifest(
      JSON.stringify({
        id: "guionista-kit",
        contributes: {
          symbolSources: [
            {
              id: "screenplay.characters",
              language: "fountain",
              kind: "character",
              include: ["bible/characters/**/*.md"],
              name: "frontmatter.name",
              aliases: ["frontmatter.aliases"],
              fallback: "heading",
            },
            {
              id: "missing-include",
              language: "fountain",
              kind: "character",
            },
          ],
        },
      }),
    );

    expect(manifest?.id).toBe("guionista-kit");
    expect(symbolSourcesForLanguage(manifest, "fountain")).toHaveLength(1);
    expect(symbolSourcesForLanguage(manifest, "fountain")[0]).toMatchObject({
      id: "screenplay.characters",
      kind: "character",
      include: ["bible/characters/**/*.md"],
    });
  });

  it("does not break on malformed JSON or missing contributions", () => {
    expect(parseContributionManifest("not json")).toBeNull();
    expect(parseContributionManifest("{}")).toEqual({});
  });

  it("matches project-relative globs", () => {
    expect(globToRegExp("bible/characters/**/*.md").test(
      "bible/characters/ana.md",
    )).toBe(true);
    expect(globToRegExp("bible/characters/**/*.md").test(
      "bible/characters/team/luis.md",
    )).toBe(true);
    expect(matchesGlob("bible/locations/casa.md", "bible/**/*.md")).toBe(true);
    expect(matchesGlob("notes/casa.md", "bible/**/*.md")).toBe(false);

    const sources = [
      {
        id: "characters",
        language: "fountain",
        kind: "character",
        include: ["bible/characters/**/*.md"],
      },
    ];
    expect(matchesAnySource("bible/characters/ana.md", sources)).toBe(true);
    expect(matchesAnySource("script/acto.fountain", sources)).toBe(false);
  });
});
