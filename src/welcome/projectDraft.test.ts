import { describe, expect, it } from "vitest";
import { WelcomeProjectRequest, WelcomeTemplate } from "../types";
import {
  buildWelcomeBriefMessage,
  validateWelcomeDraft,
  welcomeDraftFromRequest,
  welcomeDraftPreview,
} from "./projectDraft";

const templates: WelcomeTemplate[] = [
  {
    id: "guionista-kit",
    name: "Guion Audiovisual",
    description: "Biblia, estructura y guion.",
  },
  { id: "blank", name: "Proyecto en blanco", description: "Carpeta limpia." },
];

const request: WelcomeProjectRequest = {
  name: "La casa",
  templateId: "guionista-kit",
  brief: "Una historia sobre una casa.",
};

describe("welcome project draft", () => {
  it("builds from the agent request and falls back to the composer template", () => {
    expect(
      welcomeDraftFromRequest(request, templates, "/tmp/Documentos/Bradbit"),
    ).toMatchObject({
      name: "La casa",
      templateId: "guionista-kit",
      destination: "/tmp/Documentos/Bradbit",
      brief: "Una historia sobre una casa.",
    });
    expect(
      welcomeDraftFromRequest(
        { ...request, templateId: "missing" },
        templates,
        "/tmp",
        "blank",
      ).templateId,
    ).toBe("blank");
    expect(
      welcomeDraftFromRequest(
        { ...request, templateId: "missing" },
        templates,
        "/tmp",
      ).templateId,
    ).toBe("");
  });

  it("validates the brief, name, template and destination", () => {
    const draft = welcomeDraftFromRequest(request, templates, "/tmp");
    expect(validateWelcomeDraft(draft)).toBeNull();
    expect(validateWelcomeDraft({ ...draft, brief: "  " })).toBe("brief");
    expect(validateWelcomeDraft({ ...draft, name: "" })).toBe("name");
    expect(validateWelcomeDraft({ ...draft, templateId: "" })).toBe(
      "template",
    );
    expect(validateWelcomeDraft({ ...draft, destination: "" })).toBe(
      "destination",
    );
    expect(welcomeDraftPreview(draft)).toBe("/tmp/La casa");
  });

  it("builds the handoff message with the template decision", () => {
    expect(
      buildWelcomeBriefMessage("Una historia.", "Guion Audiovisual"),
    ).toBe(
      "Brief del proyecto\n\nUna historia.\n\nPlantilla: Guion Audiovisual",
    );
    expect(buildWelcomeBriefMessage("Solo el brief.", "")).toBe(
      "Brief del proyecto\n\nSolo el brief.",
    );
  });
});
