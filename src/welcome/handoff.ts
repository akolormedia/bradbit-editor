import { t } from "../i18n";
import { Language } from "../types";

export interface ProjectHandoff {
  rootPath: string;
  sessionTitle: string;
  message: string;
  model: string | null;
}

export interface ProjectHandoffInput {
  rootPath: string;
  name: string;
  brief: string;
  templateName: string;
  model: string | null;
  language: Language;
}

/**
 * Builds the first message for the project chat. Only the final brief and the
 * decisions are carried over; the welcome conversation stays behind.
 */
export function buildProjectHandoff(
  input: ProjectHandoffInput,
): ProjectHandoff {
  const brief = input.brief.trim();
  const location = input.rootPath.trim();
  const lines = [t(input.language, "welcomeBriefMessageTitle"), "", brief];
  const decisions: string[] = [];
  if (input.templateName.trim()) {
    decisions.push(
      `- ${t(input.language, "welcomeBriefTemplateLabel", {
        template: input.templateName.trim(),
      })}`,
    );
  }
  if (location) {
    decisions.push(
      `- ${t(input.language, "welcomeBriefLocation", { path: location })}`,
    );
  }
  if (decisions.length > 0) {
    lines.push("", t(input.language, "welcomeBriefDecisions"), ...decisions);
  }
  return {
    rootPath: location,
    sessionTitle: input.name.trim(),
    message: lines.join("\n"),
    model: input.model,
  };
}
