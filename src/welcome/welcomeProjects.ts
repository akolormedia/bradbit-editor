import { RecentProject } from "../types";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .trim();
}

export function filterWelcomeProjects(
  projects: readonly RecentProject[],
  query: string,
): RecentProject[] {
  const needle = normalize(query);
  if (!needle) return [...projects];
  return projects.filter((project) =>
    normalize(`${project.name} ${project.path}`).includes(needle),
  );
}
