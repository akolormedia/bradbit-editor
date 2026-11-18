import { t } from "../i18n";
import { Language } from "../types";
import { HealthReport } from "./health";

export type HealthPanelAction = "models" | "new-project" | "refresh";

export interface HealthPanelOptions {
  language: Language;
  report: HealthReport | null;
  loading: boolean;
  onAction: (action: HealthPanelAction) => void;
}

/**
 * Non-blocking first-run checklist shown on the welcome screen. It never
 * covers the editor or prevents opening a folder: writers can start without
 * an AI provider.
 */
export function createHealthPanel(options: HealthPanelOptions): HTMLElement {
  const { language, report, loading, onAction } = options;
  const section = document.createElement("section");
  section.className = "health-card";
  section.dataset.testid = "health-card";

  const header = document.createElement("div");
  header.className = "health-header";
  const title = document.createElement("h3");
  title.textContent = t(language, "healthTitle");
  const badge = document.createElement("span");
  badge.className = "health-badge";
  if (loading) {
    badge.textContent = t(language, "healthChecking");
  } else if (report?.ready) {
    badge.classList.add("ok");
    badge.textContent = t(language, "healthReady");
  } else if (report) {
    badge.textContent = t(language, "healthProgress", {
      ok: String(report.okCount),
      total: String(report.total),
    });
  } else {
    badge.textContent = t(language, "healthUnknown");
  }
  header.append(title, badge);

  section.appendChild(header);

  if (loading) {
    const checking = document.createElement("p");
    checking.className = "health-checking";
    checking.dataset.testid = "health-checking";
    checking.textContent = t(language, "healthChecking");
    section.appendChild(checking);
  } else if (!report) {
    const error = document.createElement("p");
    error.className = "health-error";
    error.dataset.testid = "health-error";
    error.textContent = t(language, "healthError");
    section.appendChild(error);
  } else {
    const list = document.createElement("div");
    list.className = "health-checks";
    for (const check of report.checks) {
      const row = document.createElement("div");
      row.className = "health-check";
      row.dataset.testid = `health-check-${check.id}`;
      row.dataset.level = check.level;

      const dot = document.createElement("span");
      dot.className = `health-dot ${check.level}`;
      dot.setAttribute("aria-hidden", "true");

      const body = document.createElement("div");
      body.className = "health-check-body";
      const name = document.createElement("strong");
      name.textContent = t(language, check.titleKey);
      const detail = document.createElement("span");
      detail.textContent = t(
        language,
        check.detailKey,
        check.detailParams,
      );
      detail.title = detail.textContent;
      body.append(name, detail);

      row.append(dot, body);

      if (check.action) {
        row.classList.add("has-action");
        const action = document.createElement("button");
        action.type = "button";
        action.className = "toolbar-btn health-action";
        action.dataset.testid = `health-action-${check.action.id}`;
        action.textContent = t(language, check.action.labelKey);
        action.onclick = () => onAction(check.action!.id);
        row.appendChild(action);
      }

      list.appendChild(row);
    }
    section.appendChild(list);
  }

  const footer = document.createElement("div");
  footer.className = "health-footer";
  const note = document.createElement("p");
  note.className = "health-note";
  note.textContent = t(language, "healthNote");
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "toolbar-btn health-refresh";
  refresh.dataset.testid = "health-refresh";
  refresh.disabled = loading;
  refresh.textContent = t(language, "healthRefresh");
  refresh.onclick = () => onAction("refresh");
  footer.append(note, refresh);
  section.appendChild(footer);

  return section;
}
