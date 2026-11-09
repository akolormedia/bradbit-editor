import { describe, expect, it } from "vitest";
import {
  validateWelcomeDraft,
  welcomeDraftFromRequest,
  welcomeDraftPreview,
} from "./projectDraft";

const templates = [
  {
    id: "guionista-kit",
    name: "Guion Audiovisual",
    description: "Biblia, estructura y guion.",
  },
  {
    id: "blank",
    name: "Proyecto en blanco",
    description: "Carpeta limpia.",
  },
];

describe("welcome project draft (T-2.5.10)", () => {
  it("builds a draft from the agent request and keeps a valid template", () => {
    const draft = welcomeDraftFromRequest(
      { name: "  Mi serie  ", templateId: "blank" },
      templates,
      "/Users/rafa/Documents/Bradbit",
    );
    expect(draft).toEqual({
      name: "  Mi serie  ",
      templateId: "blank",
      destination: "/Users/rafa/Documents/Bradbit",
      submitting: false,
      error: "",
    });
  });

  it("falls back to the first template when the agent invents one", () => {
    const draft = welcomeDraftFromRequest(
      { name: "Mi serie", templateId: "inexistente" },
      templates,
      "/tmp",
    );
    expect(draft.templateId).toBe("guionista-kit");
  });

  it("validates the name and destination before creating", () => {
    const draft = welcomeDraftFromRequest(
      { name: "Mi serie", templateId: "blank" },
      templates,
      "/Users/rafa/Documents/Bradbit",
    );
    expect(validateWelcomeDraft(draft)).toBeNull();
    expect(welcomeDraftPreview(draft)).toBe(
      "/Users/rafa/Documents/Bradbit/Mi serie",
    );
    expect(validateWelcomeDraft({ ...draft, name: "  " })).toBe("name");
    expect(validateWelcomeDraft({ ...draft, destination: "" })).toBe(
      "destination",
    );
  });
});
