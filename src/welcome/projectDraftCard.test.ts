// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { renderWelcomeDraftCard } from "./projectDraftCard";
import { WelcomeDraft } from "./projectDraft";

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

function draft(overrides: Partial<WelcomeDraft> = {}): WelcomeDraft {
  return {
    name: "Mi serie",
    templateId: "guionista-kit",
    destination: "/Users/rafa/Documents/Bradbit",
    submitting: false,
    error: "",
    ...overrides,
  };
}

describe("welcome draft card (T-2.5.10)", () => {
  it("renders the proposed project, path and template description", () => {
    const card = renderWelcomeDraftCard({
      language: "es",
      draft: draft(),
      templates,
      onChange: vi.fn(),
      onChooseDestination: vi.fn(),
      onCreate: vi.fn(),
    });
    expect(card.textContent).toContain("Proyecto propuesto");
    expect(card.textContent).toContain("Biblia, estructura y guion.");
    expect(card.textContent).toContain(
      "Se creará en: /Users/rafa/Documents/Bradbit/Mi serie",
    );
    expect(
      card.querySelector<HTMLInputElement>(
        '[data-testid="welcome-draft-name"]',
      )?.value,
    ).toBe("Mi serie");
  });

  it("reports edits, destination changes and creation", () => {
    const onChange = vi.fn();
    const onChooseDestination = vi.fn();
    const onCreate = vi.fn();
    const card = renderWelcomeDraftCard({
      language: "es",
      draft: draft(),
      templates,
      onChange,
      onChooseDestination,
      onCreate,
    });

    const name = card.querySelector<HTMLInputElement>(
      '[data-testid="welcome-draft-name"]',
    )!;
    name.value = "Nueva serie";
    name.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith({ name: "Nueva serie" });

    const template = card.querySelector<HTMLSelectElement>(
      '[data-testid="welcome-draft-template"]',
    )!;
    template.value = "blank";
    template.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith({ templateId: "blank" });

    card
      .querySelector<HTMLButtonElement>('[data-testid="welcome-draft-choose"]')
      ?.click();
    expect(onChooseDestination).toHaveBeenCalled();

    card
      .querySelector<HTMLButtonElement>('[data-testid="welcome-draft-create"]')
      ?.click();
    expect(onCreate).toHaveBeenCalled();
  });

  it("disables creation while submitting and shows errors", () => {
    const card = renderWelcomeDraftCard({
      language: "es",
      draft: draft({ submitting: true, error: "Carpeta ocupada" }),
      templates,
      onChange: vi.fn(),
      onChooseDestination: vi.fn(),
      onCreate: vi.fn(),
    });
    expect(
      card.querySelector<HTMLButtonElement>(
        '[data-testid="welcome-draft-create"]',
      )?.disabled,
    ).toBe(true);
    expect(card.textContent).toContain("Creando…");
    expect(
      card.querySelector('[data-testid="welcome-draft-error"]')?.textContent,
    ).toBe("Carpeta ocupada");
  });
});
