import { t } from "../i18n";
import { Language, WelcomeTemplate } from "../types";
import { WelcomeDraft, welcomeDraftPreview } from "./projectDraft";

export interface WelcomeDraftCardOptions {
  language: Language;
  draft: WelcomeDraft;
  templates: WelcomeTemplate[];
  onChange: (patch: Partial<WelcomeDraft>) => void;
  onChooseDestination: () => void;
  onCreate: () => void;
}

export function renderWelcomeDraftCard(
  options: WelcomeDraftCardOptions,
): HTMLElement {
  const { language, templates, draft } = options;
  let current = { ...draft };
  const emit = (patch: Partial<WelcomeDraft>) => {
    current = { ...current, ...patch };
    options.onChange(patch);
  };
  const card = document.createElement("section");
  card.className = "welcome-card welcome-draft-card";
  card.dataset.testid = "welcome-draft";

  const header = document.createElement("div");
  header.className = "welcome-header";
  const title = document.createElement("h2");
  title.textContent = t(language, "welcomeDraftTitle");
  const hint = document.createElement("p");
  hint.textContent = t(language, "welcomeDraftHint");
  header.append(title, hint);

  const templateField = document.createElement("div");
  templateField.className = "form-row";
  const templateLabel = document.createElement("label");
  templateLabel.className = "form-label";
  templateLabel.textContent = t(language, "templateLabel");
  const templateSelect = document.createElement("select");
  templateSelect.className = "select-input";
  templateSelect.dataset.testid = "welcome-draft-template";
  templateSelect.disabled = draft.submitting || templates.length === 0;
  for (const template of templates) {
    const option = document.createElement("option");
    option.value = template.id;
    option.textContent = template.name;
    templateSelect.appendChild(option);
  }
  templateSelect.value = draft.templateId;
  const templateDescription = document.createElement("p");
  templateDescription.className = "template-description";
  templateDescription.textContent =
    templates.find((template) => template.id === draft.templateId)
      ?.description ?? "";
  templateSelect.onchange = () => {
    const selected = templates.find(
      (template) => template.id === templateSelect.value,
    );
    templateDescription.textContent = selected?.description ?? "";
    syncPreview();
    emit({ templateId: templateSelect.value });
  };
  templateField.append(templateLabel, templateSelect, templateDescription);

  const nameField = document.createElement("div");
  nameField.className = "form-row";
  const nameLabel = document.createElement("label");
  nameLabel.className = "form-label";
  nameLabel.textContent = t(language, "projectNameLabel");
  const nameInput = document.createElement("input");
  nameInput.className = "text-input";
  nameInput.dataset.testid = "welcome-draft-name";
  nameInput.value = draft.name;
  nameInput.disabled = draft.submitting;
  nameInput.placeholder = t(language, "projectNamePlaceholder");
  nameInput.oninput = () => {
    syncPreview();
    emit({ name: nameInput.value });
  };
  nameField.append(nameLabel, nameInput);

  const destinationField = document.createElement("div");
  destinationField.className = "form-row";
  const destinationLabel = document.createElement("label");
  destinationLabel.className = "form-label";
  destinationLabel.textContent = t(language, "projectDestinationLabel");
  const destinationRow = document.createElement("div");
  destinationRow.className = "destination-row";
  const destinationInput = document.createElement("input");
  destinationInput.className = "text-input";
  destinationInput.dataset.testid = "welcome-draft-destination";
  destinationInput.value = draft.destination;
  destinationInput.disabled = draft.submitting;
  destinationInput.placeholder = t(
    language,
    "projectDestinationPlaceholder",
  );
  destinationInput.oninput = () => {
    syncPreview();
    emit({ destination: destinationInput.value });
  };
  const chooseButton = document.createElement("button");
  chooseButton.type = "button";
  chooseButton.className = "toolbar-btn";
  chooseButton.dataset.testid = "welcome-draft-choose";
  chooseButton.disabled = draft.submitting;
  chooseButton.textContent = t(language, "chooseFolder");
  chooseButton.onclick = () => options.onChooseDestination();
  destinationRow.append(destinationInput, chooseButton);
  destinationField.append(destinationLabel, destinationRow);

  const preview = document.createElement("div");
  preview.className = "project-path-preview";

  const footer = document.createElement("div");
  footer.className = "modal-footer welcome-draft-footer";
  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.className = "toolbar-btn primary";
  createButton.dataset.testid = "welcome-draft-create";
  createButton.textContent = draft.submitting
    ? t(language, "creatingProject")
    : t(language, "createProject");
  createButton.onclick = () => options.onCreate();
  footer.appendChild(createButton);

  function syncPreview(): void {
    const path = welcomeDraftPreview(current);
    preview.textContent = path
      ? `${t(language, "projectWillBeCreatedAt")} ${path}`
      : "";
    createButton.disabled =
      current.submitting || templates.length === 0 || !path;
  }
  syncPreview();

  card.append(
    header,
    templateField,
    nameField,
    destinationField,
    preview,
    footer,
  );
  if (draft.error) {
    const error = document.createElement("div");
    error.className = "error-banner";
    error.dataset.testid = "welcome-draft-error";
    error.textContent = draft.error;
    card.appendChild(error);
  }
  return card;
}
