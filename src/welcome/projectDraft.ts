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
  brief: string;
  submitting: boolean;
  error: string;
}

export type WelcomeDraftError = ProjectDraftError | "brief";

export function welcomeDraftFromRequest(
  request: WelcomeProjectRequest,
  templates: readonly WelcomeTemplate[],
  destination: string,
  fallbackTemplateId = "",
): WelcomeDraft {
  const requested = templates.some(
    (template) => template.id === request.templateId,
  )
    ? request.templateId
    : "";
  const fallback = templates.some(
    (template) => template.id === fallbackTemplateId,
  )
    ? fallbackTemplateId
    : "";
  return {
    name: request.name,
    templateId: requested || fallback,
    destination,
    brief: request.brief,
    submitting: false,
    error: "",
  };
}

export function validateWelcomeDraft(
  draft: WelcomeDraft,
): WelcomeDraftError | null {
  if (!draft.brief.trim()) return "brief";
  return validateProjectDraft({
    templateId: draft.templateId,
    name: draft.name,
    destination: draft.destination,
  });
}

export function welcomeDraftPreview(draft: WelcomeDraft): string {
  return projectPathPreview(draft.destination, draft.name);
}
