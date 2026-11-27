import { describe, expect, it } from "vitest";
import { toolFileActivity } from "./toolFiles";

const root = "/Users/ana/Documents/Bradbit/La casa";

function event(tool: Record<string, unknown>): Record<string, unknown> {
  return { tool };
}

describe("tool file activity", () => {
  it("opens the first project file written by a tool", () => {
    expect(
      toolFileActivity(
        root,
        "session.tool.called",
        event({
          id: "tool_w",
          name: "write",
          files: [`${root}/script/capitulo-1.fountain`],
        }),
      ),
    ).toEqual({
      toolId: "tool_w",
      path: "script/capitulo-1.fountain",
      phase: "running",
    });
  });

  it("reports completion and errors for edits", () => {
    const edit = {
      id: "tool_e",
      name: "edit",
      files: ["bible/premise.md"],
    };
    expect(
      toolFileActivity(root, "session.tool.success", event(edit)),
    ).toEqual({
      toolId: "tool_e",
      path: "bible/premise.md",
      phase: "completed",
    });
    expect(
      toolFileActivity(root, "session.tool.failed", event(edit)),
    ).toEqual({
      toolId: "tool_e",
      path: "bible/premise.md",
      phase: "error",
    });
  });

  it("ignores reads, missing tools and paths outside the project", () => {
    expect(
      toolFileActivity(
        root,
        "session.tool.called",
        event({ id: "tool_r", name: "read", files: ["notas.md"] }),
      ),
    ).toBeNull();
    expect(
      toolFileActivity(
        root,
        "session.tool.called",
        event({ id: "tool_w", name: "write", files: [] }),
      ),
    ).toBeNull();
    expect(
      toolFileActivity(
        root,
        "session.tool.called",
        event({
          id: "tool_w",
          name: "write",
          files: ["/tmp/outside.md"],
        }),
      ),
    ).toBeNull();
    expect(
      toolFileActivity(root, "session.tool.progress", event({})),
    ).toBeNull();
  });
});
