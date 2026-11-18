import { classifyFountainLine, createFountainState } from "./fountain";

export interface FountainSymbols {
  characters: string[];
  locations: string[];
}

export const EMPTY_FOUNTAIN_SYMBOLS: FountainSymbols = {
  characters: [],
  locations: [],
};

const SCENE_PREFIX =
  /^(?:INT\.\/EXT\.|INT\/EXT\.|EXT\/INT\.|I\/E\.|INT\.|EXT\.|EST\.)\s*/i;

function uniqueNames(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const name = value.trim();
    if (!name) continue;
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

/** Character cues already used in the current screenplay. */
export function extractFountainCharacters(source: string): string[] {
  const characters: string[] = [];
  let state = createFountainState();
  for (const line of source.split(/\r?\n/)) {
    const classified = classifyFountainLine(line, state);
    state = classified.state;
    if (classified.type !== "character") continue;
    characters.push(line.trim().replace(/^@/, ""));
  }
  return uniqueNames(characters);
}

/** Scene locations already used in the current screenplay. */
export function extractFountainLocations(source: string): string[] {
  const locations: string[] = [];
  let state = createFountainState();
  for (const line of source.split(/\r?\n/)) {
    const classified = classifyFountainLine(line, state);
    state = classified.state;
    if (classified.type !== "scene") continue;
    let text = line.trim();
    if (text.startsWith(".") && !SCENE_PREFIX.test(text)) {
      text = text.replace(/^\.+/, "");
    }
    text = text.replace(SCENE_PREFIX, "");
    const location = text.split(/\s+-\s+/)[0]?.trim() ?? "";
    if (location) locations.push(location);
  }
  return uniqueNames(locations);
}

export function collectFountainSymbols(
  source: string,
  contributedCharacters: string[] = [],
  contributedLocations: string[] = [],
): FountainSymbols {
  return {
    characters: uniqueNames([
      ...contributedCharacters,
      ...extractFountainCharacters(source),
    ]),
    locations: uniqueNames([
      ...contributedLocations,
      ...extractFountainLocations(source),
    ]),
  };
}
