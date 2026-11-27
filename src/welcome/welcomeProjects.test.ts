import { describe, expect, it } from "vitest";
import { RecentProject } from "../types";
import { filterWelcomeProjects } from "./welcomeProjects";

const project = (name: string, path: string): RecentProject => ({
  name,
  path,
  lastOpened: "2026-11-27T10:00:00Z",
});

const projects = [
  project("Guion principal", "/Users/ana/Guion"),
  project("Novela Café", "/Users/ana/Novela"),
  project("Campaña Norte", "/Users/ana/Campana"),
];

describe("welcome project filter", () => {
  it("returns every project when the query is empty", () => {
    expect(filterWelcomeProjects(projects, "  ")).toEqual(projects);
  });

  it("filters by name and path ignoring case and accents", () => {
    expect(filterWelcomeProjects(projects, "CAFE")).toEqual([projects[1]]);
    expect(filterWelcomeProjects(projects, "campana")).toEqual([projects[2]]);
    expect(filterWelcomeProjects(projects, "ana/guion")).toEqual([projects[0]]);
    expect(filterWelcomeProjects(projects, "zzz")).toEqual([]);
  });
});
