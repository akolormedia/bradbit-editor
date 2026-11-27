import { describe, expect, it } from "vitest";
import { buildProjectHandoff } from "./handoff";

describe("project handoff", () => {
  it("carries the brief and decisions into the project chat", () => {
    expect(
      buildProjectHandoff({
        rootPath: "/Users/ana/Documents/Bradbit/La casa",
        name: "  La casa  ",
        brief: "  Una historia sobre una casa.  ",
        templateName: "Guion Audiovisual",
        model: "opencode-go/hy4#high",
        language: "es",
      }),
    ).toEqual({
      rootPath: "/Users/ana/Documents/Bradbit/La casa",
      sessionTitle: "La casa",
      message:
        "Brief del proyecto\n\nUna historia sobre una casa.\n\nDecisiones\n- Plantilla: Guion Audiovisual\n- Ubicación: /Users/ana/Documents/Bradbit/La casa",
      model: "opencode-go/hy4#high",
    });
  });

  it("localizes the heading and omits empty decisions", () => {
    expect(
      buildProjectHandoff({
        rootPath: "/tmp/Story",
        name: "Story",
        brief: "A story.",
        templateName: "",
        model: null,
        language: "en",
      }),
    ).toEqual({
      rootPath: "/tmp/Story",
      sessionTitle: "Story",
      message:
        "Project brief\n\nA story.\n\nDecisions\n- Location: /tmp/Story",
      model: null,
    });
  });
});
