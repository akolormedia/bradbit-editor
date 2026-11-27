import { describe, expect, it } from "vitest";
import { WelcomeTemplate } from "../types";
import {
  welcomeTemplateLabel,
  welcomeTemplateSourceLabel,
} from "./templates";

const templates: WelcomeTemplate[] = [
  {
    id: "guionista-kit",
    name: "Guion Audiovisual",
    description: "Biblia, estructura y guion.",
  },
  {
    id: "blank",
    name: "Proyecto en blanco",
    description: "Una carpeta limpia.",
  },
];

describe("welcome template labels", () => {
  it("labels the chat decision and known templates", () => {
    expect(welcomeTemplateLabel("es", "", templates)).toBe(
      "Decidir en el chat",
    );
    expect(welcomeTemplateLabel("es", "guionista-kit", templates)).toBe(
      "Guion Audiovisual",
    );
    expect(welcomeTemplateLabel("en", "blank", templates)).toBe(
      "Proyecto en blanco",
    );
    expect(welcomeTemplateLabel("es", "missing", templates)).toBe("Plantilla");
  });

  it("labels template sources", () => {
    expect(welcomeTemplateSourceLabel("es", "bundled")).toBe("Incluida");
    expect(welcomeTemplateSourceLabel("es", "user")).toBe("Tuya");
    expect(welcomeTemplateSourceLabel("en", "blank")).toBe("Blank");
  });
});
