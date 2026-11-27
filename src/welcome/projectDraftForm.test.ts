// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WelcomeTemplate } from "../types";
import { WelcomeDraft } from "./projectDraft";
import { renderWelcomeProjectForm } from "./projectDraftForm";

const templates: WelcomeTemplate[] = [
  { id: "guionista-kit", name: "Guion Audiovisual", description: "Guion." },
  { id: "blank", name: "Proyecto en blanco", description: "Limpio." },
];

const draft: WelcomeDraft = {
  name: "La casa",
  templateId: "guionista-kit",
  destination: "/Users/ana/Documents/Bradbit",
  brief: "Una historia sobre una casa.",
  submitting: false,
  error: "",
};

function mount(
  overrides: Partial<WelcomeDraft> = {},
  destinationPickedBeforeChat = true,
) {
  const onChange = vi.fn();
  const onChooseDestination = vi.fn();
  const onUsePickedDestination = vi.fn();
  const onCancel = vi.fn();
  const onCreate = vi.fn();
  const form = renderWelcomeProjectForm({
    language: "es",
    draft: { ...draft, ...overrides },
    templates,
    destinationPickedBeforeChat,
    onChange,
    onChooseDestination,
    onUsePickedDestination,
    onCancel,
    onCreate,
  });
  document.body.appendChild(form);
  return {
    form,
    onChange,
    onChooseDestination,
    onUsePickedDestination,
    onCancel,
    onCreate,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("welcome project form", () => {
  it("renders the brief, name, template, destination and preview", () => {
    const { form } = mount();
    expect(
      form.querySelector<HTMLTextAreaElement>(
        '[data-testid="welcome-project-brief"]',
      )!.value,
    ).toBe("Una historia sobre una casa.");
    expect(
      form.querySelector<HTMLInputElement>(
        '[data-testid="welcome-project-name"]',
      )!.value,
    ).toBe("La casa");
    expect(
      form.querySelector<HTMLSelectElement>(
        '[data-testid="welcome-project-template"]',
      )!.value,
    ).toBe("guionista-kit");
    expect(form.textContent).toContain(
      "Antes del chat elegiste esta carpeta. ¿La usamos para el proyecto?",
    );
    expect(form.textContent).toContain(
      "/Users/ana/Documents/Bradbit/La casa",
    );
  });

  it("asks for a folder only when one was picked before the chat", () => {
    const { form } = mount({}, false);
    expect(
      form.querySelector(
        '[data-testid="welcome-project-destination-question"]',
      ),
    ).toBeNull();
    expect(form.textContent).toContain(
      "El proyecto se creará dentro de esta carpeta.",
    );
  });

  it("emits changes and calls the form actions", () => {
    const {
      form,
      onChange,
      onChooseDestination,
      onUsePickedDestination,
      onCancel,
      onCreate,
    } = mount();
    const name = form.querySelector<HTMLInputElement>(
      '[data-testid="welcome-project-name"]',
    )!;
    name.value = "Otra casa";
    name.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith({ name: "Otra casa" });

    const brief = form.querySelector<HTMLTextAreaElement>(
      '[data-testid="welcome-project-brief"]',
    )!;
    brief.value = "Nuevo brief";
    brief.dispatchEvent(new Event("input"));
    expect(onChange).toHaveBeenCalledWith({ brief: "Nuevo brief" });

    const select = form.querySelector<HTMLSelectElement>(
      '[data-testid="welcome-project-template"]',
    )!;
    select.value = "blank";
    select.dispatchEvent(new Event("change"));
    expect(onChange).toHaveBeenCalledWith({ templateId: "blank" });

    form
      .querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-choose-destination"]',
      )!
      .click();
    expect(onChooseDestination).toHaveBeenCalledOnce();

    form
      .querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-use-destination"]',
      )!
      .click();
    expect(onUsePickedDestination).toHaveBeenCalledOnce();

    form
      .querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-pick-another"]',
      )!
      .click();
    expect(onChooseDestination).toHaveBeenCalledTimes(2);

    form
      .querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-cancel"]',
      )!
      .click();
    expect(onCancel).toHaveBeenCalledOnce();

    form
      .querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-create"]',
      )!
      .click();
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it("shows errors and the creating state", () => {
    const { form } = mount({
      submitting: true,
      error: "El brief no puede estar vacío.",
    });
    expect(
      form.querySelector<HTMLElement>('[data-testid="welcome-project-error"]')!
        .hidden,
    ).toBe(false);
    expect(
      form.querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-create"]',
      )!.textContent,
    ).toBe("Creando…");
    expect(
      form.querySelector<HTMLButtonElement>(
        '[data-testid="welcome-project-create"]',
      )!.disabled,
    ).toBe(true);
  });
});
