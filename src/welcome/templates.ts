import { t } from "../i18n";
import { Language, WelcomeTemplate } from "../types";

export function welcomeTemplateLabel(
  language: Language,
  templateId: string,
  templates: readonly WelcomeTemplate[],
): string {
  if (!templateId) return t(language, "welcomeTemplateDecide");
  return (
    templates.find((template) => template.id === templateId)?.name ??
    t(language, "welcomeTemplateLabel")
  );
}

export function welcomeTemplateSourceLabel(
  language: Language,
  source: string,
): string {
  if (source === "bundled") {
    return t(language, "welcomeTemplateSourceBundled");
  }
  if (source === "user") return t(language, "welcomeTemplateSourceUser");
  return t(language, "welcomeTemplateSourceBlank");
}
