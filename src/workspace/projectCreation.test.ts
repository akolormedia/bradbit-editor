import { describe, expect, it } from "vitest";
import {
  defaultProjectDestination,
  parentDirectory,
  projectPathPreview,
  validateProjectDraft,
} from "./projectCreation";

describe("project creation helpers (T-1.3.2)", () => {
  it("finds the parent directory of an open project", () => {
    expect(parentDirectory("/Users/rafa/Documents/guionista-kit")).toBe(
      "/Users/rafa/Documents",
    );
    expect(parentDirectory("/Users/rafa/Documents/guionista-kit/")).toBe(
      "/Users/rafa/Documents",
    );
    expect(parentDirectory("/")).toBe("/");
    expect(parentDirectory("")).toBe("");
  });

  it("uses the current project parent as the default destination", () => {
    expect(defaultProjectDestination("/Users/rafa/proyectos/actual")).toBe(
      "/Users/rafa/proyectos",
    );
    expect(defaultProjectDestination(null)).toBe("");
  });

  it("builds a readable final path preview", () => {
    expect(projectPathPreview("/Users/rafa/proyectos/", "nuevo-guion")).toBe(
      "/Users/rafa/proyectos/nuevo-guion",
    );
    expect(projectPathPreview("", "nuevo-guion")).toBe("");
    expect(projectPathPreview("/Users/rafa/proyectos", "  ")).toBe("");
  });

  it("validates the draft before calling the backend", () => {
    expect(
      validateProjectDraft({ templateId: "", name: "x", destination: "/tmp" }),
    ).toBe("template");
    expect(
      validateProjectDraft({ templateId: "blank", name: "", destination: "/tmp" }),
    ).toBe("name");
    expect(
      validateProjectDraft({ templateId: "blank", name: ".oculto", destination: "/tmp" }),
    ).toBe("nameInvalid");
    expect(
      validateProjectDraft({
        templateId: "blank",
        name: "con/barra",
        destination: "/tmp",
      }),
    ).toBe("nameInvalid");
    expect(
      validateProjectDraft({ templateId: "blank", name: "Proyecto", destination: "" }),
    ).toBe("destination");
    expect(
      validateProjectDraft({
        templateId: "guionista-kit",
        name: "Mi guion",
        destination: "/Users/rafa/proyectos",
      }),
    ).toBeNull();
  });
});
