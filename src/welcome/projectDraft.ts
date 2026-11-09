import { WelcomeProjectRequest, WelcomeTemplate } from "../types";
import {
  projectPathPreview,
  ProjectDraftError,
  validateProjectDraft,
} from "../workspace/projectCreation";

export interface WelcomeDraft {
  name: string;
  templateId: string;
  destination: string;
  submitting: boolean;
  error: string;
}

export function welcomeDraftFromRequest(
  request: WelcomeProjectRequest,
  templates: WelcomeTemplate[],
  defaultDestination: string,
): WelcomeDraft {
  const templateId = templates.some(
    (template) => template.id === request.templateId,
  )
    ? request.templateId
    : templates[0]?.id ?? "";
  return {
    name: request.name,
    templateId,
    destination: defaultDestination,
    submitting: false,
    error: "",
  };
}

export function validateWelcomeDraft(
  draft: WelcomeDraft,
): ProjectDraftError | null {
  return validateProjectDraft({
    templateId: draft.templateId,
    name: draft.name,
    destination: draft.destination,
  });
}

export function welcomeDraftPreview(draft: WelcomeDraft): string {
  return projectPathPreview(draft.destination, draft.name);
}
