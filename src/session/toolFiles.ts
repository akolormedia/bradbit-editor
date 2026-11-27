import { projectRelativePath } from "./chatPaths";

export type ToolFilePhase = "running" | "completed" | "error";

export interface ToolFileActivity {
  toolId: string;
  path: string;
  phase: ToolFilePhase;
}

const FILE_TOOLS = new Set([
  "write",
  "edit",
  "patch",
  "multiedit",
  "apply_patch",
]);

const PHASES: Record<string, ToolFilePhase | undefined> = {
  "session.tool.called": "running",
  "session.tool.success": "completed",
  "session.tool.failed": "error",
};

/**
 * Resolves which project file a tool event is working on. Only write-like
 * tools are returned; reads and shell commands stay out of the live editor.
 */
export function toolFileActivity(
  root: string | null | undefined,
  eventType: string,
  data: Record<string, unknown>,
): ToolFileActivity | null {
  const phase = PHASES[eventType];
  if (!phase) return null;
  const raw = data.tool;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const tool = raw as Record<string, unknown>;
  const toolId = typeof tool.id === "string" ? tool.id : "";
  const name = typeof tool.name === "string" ? tool.name : "";
  if (!toolId || !FILE_TOOLS.has(name)) return null;
  const files = Array.isArray(tool.files)
    ? tool.files.filter((file): file is string => typeof file === "string")
    : [];
  for (const file of files) {
    const path = projectRelativePath(root, file);
    if (path) return { toolId, path, phase };
  }
  return null;
}
