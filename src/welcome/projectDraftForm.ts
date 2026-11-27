import { t } from "../i18n";
import { Language, WelcomeTemplate } from "../types";
import { WelcomeDraft, welcomeDraftPreview } from "./projectDraft";

export interface WelcomeProjectFormOptions {
  language: Language;
  draft: WelcomeDraft;
  templates: readonly WelcomeTemplate[];
  destinationPickedBeforeChat: boolean;
  onChange: (patch: Partial<WelcomeDraft>) => void;
  onChooseDestination: () => void;
  onUsePickedDestination: () => void;
  onCancel: () => void;
  onCreate: () => void;
}

export function renderWelcomeProjectForm(
  options: WelcomeProjectFormOptions,
): HTMLElement {
  const { language, templates, draft } = options;
  let current = { ...draft };
  const emit = (patch: Partial<WelcomeDraft>) => {
    current = { ...current, ...patch };
    options.onChange(patch);
  };

  const root = document.createElement("div");
  root.className = "welcome-project-form";
  root.dataset.testid = "welcome-project-form";

  const header = document.createElement("div");
  header.className = "welcome-project-form-header";
  const title = document.createElement("h3");
  title.textContent = t(language, "welcomeProjectTitle");
  const hint = document.createElement("p");
  hint.textContent = t(language, "welcomeProjectHint");
  header.append(title, hint);

  const briefField = document.createElement("div");
  briefField.className = "form-row";
  const briefLabel = document.createElement("label");
  briefLabel.className = "form-label";
  briefLabel.textContent = t(language, "welcomeProjectBrief");
  const briefHint = document.createElement("p");
  briefHint.className = "settings-hint";
  briefHint.textContent = t(language, "welcomeProjectBriefHint");
  const brief = document.createElement("textarea");
  brief.className = "text-input welcome-project-brief";
  brief.dataset.testid = "welcome-project-brief";
  brief.rows = 8;
  brief.value = draft.brief;
  brief.placeholder = t(language, "welcomeProjectBriefPlaceholder");
  brief.oninput = () => emit({ brief: brief.value });
  briefField.append(briefLabel, briefHint, brief);

  const nameField = document.createElement("div");
  nameField.className = "form-row";
  const nameLabel = document.createElement("label");
  nameLabel.className = "form-label";
  nameLabel.textContent = t(language, "projectNameLabel");
  const name = document.createElement("input");
  name.className = "text-input";
  name.dataset.testid = "welcome-project-name";
  name.value = draft.name;
  name.placeholder = t(language, "projectNamePlaceholder");
  name.oninput = () => {
    emit({ name: name.value });
    syncPreview();
  };
  nameField.append(nameLabel, name);

  const templateField = document.createElement("div");
  templateField.className = "form-row";
  const templateLabel = document.createElement("label");
  templateLabel.className = "form-label";
  templateLabel.textContent = t(language, "templateLabel");
  const template = document.createElement("select");
  template.className = "select-input";
  template.dataset.testid = "welcome-project-template";
  if (!current.templateId) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = t(language, "welcomeTemplatePlaceholder");
    placeholder.disabled = true;
    placeholder.selected = true;
    template.appendChild(placeholder);
  }
  for (const item of templates) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    template.appendChild(option);
  }
  template.value = current.templateId;
  const templateDescription = document.createElement("p");
  templateDescription.className = "template-description";
  templateDescription.textContent =
    templates.find((item) => item.id === current.templateId)?.description ??
    "";
  template.onchange = () => {
    const selected = templates.find((item) => item.id === template.value);
    templateDescription.textContent = selected?.description ?? "";
    emit({ templateId: template.value });
  };
  templateField.append(templateLabel, template, templateDescription);

  const destinationField = document.createElement("div");
  destinationField.className = "form-row";
  const destinationLabel = document.createElement("label");
  destinationLabel.className = "form-label";
  destinationLabel.textContent = t(language, "projectDestinationLabel");
  const destinationRow = document.createElement("div");
  destinationRow.className = "destination-row";
  const destination = document.createElement("input");
  destination.className = "text-input";
  destination.dataset.testid = "welcome-project-destination";
  destination.value = draft.destination;
  destination.placeholder = t(language, "projectDestinationPlaceholder");
  destination.oninput = () => {
    emit({ destination: destination.value });
    syncPreview();
  };
  const choose = document.createElement("button");
  choose.type = "button";
  choose.className = "toolbar-btn";
  choose.dataset.testid = "welcome-project-choose-destination";
  choose.textContent = t(language, "chooseFolder");
  choose.onclick = () => options.onChooseDestination();
  destinationRow.append(destination, choose);
  if (options.destinationPickedBeforeChat) {
    const question = document.createElement("div");
    question.className = "welcome-destination-question";
    question.dataset.testid = "welcome-project-destination-question";
    const questionText = document.createElement("p");
    questionText.textContent = t(
      language,
      "welcomeProjectDestinationQuestion",
    );
    const questionActions = document.createElement("div");
    questionActions.className = "welcome-destination-question-actions";
    const usePicked = document.createElement("button");
    usePicked.type = "button";
    usePicked.className = "toolbar-btn";
    usePicked.dataset.testid = "welcome-project-use-destination";
    usePicked.textContent = t(language, "welcomeProjectDestinationUse");
    usePicked.onclick = () => options.onUsePickedDestination();
    const other = document.createElement("button");
    other.type = "button";
    other.className = "toolbar-btn";
    other.dataset.testid = "welcome-project-pick-another";
    other.textContent = t(language, "welcomeProjectDestinationOther");
    other.onclick = () => options.onChooseDestination();
    questionActions.append(usePicked, other);
    question.append(questionText, questionActions);
    destinationField.appendChild(question);
  }
  const destinationNote = document.createElement("p");
  destinationNote.className = "settings-hint";
  destinationNote.textContent = t(language, "welcomeProjectDestinationNote");
  destinationField.append(destinationLabel, destinationRow, destinationNote);

  const preview = document.createElement("div");
  preview.className = "project-path-preview";

  const error = document.createElement("div");
  error.className = "error-banner";
  error.dataset.testid = "welcome-project-error";
  error.hidden = !draft.error;
  error.textContent = draft.error;

  const footer = document.createElement("div");
  footer.className = "modal-footer welcome-project-footer";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "toolbar-btn";
  cancel.dataset.testid = "welcome-project-cancel";
  cancel.textContent = t(language, "welcomeProjectContinue");
  cancel.onclick = () => options.onCancel();
  const create = document.createElement("button");
  create.type = "button";
  create.className = "toolbar-btn primary";
  create.dataset.testid = "welcome-project-create";
  create.textContent = t(
    language,
    draft.submitting ? "creatingProject" : "createProject",
  );
  create.disabled = draft.submitting;
  create.onclick = () => options.onCreate();
  footer.append(cancel, create);

  function syncPreview(): void {
    const path = welcomeDraftPreview(current);
    preview.textContent = path
      ? `${t(language, "projectWillBeCreatedAt")} ${path}`
      : "";
  }
  syncPreview();

  root.append(
    header,
    briefField,
    nameField,
    templateField,
    destinationField,
    preview,
    error,
    footer,
  );
  return root;
}
