import { describe, expect, it } from "vitest";
import { versionTerm } from "./versionTerms";

describe("version terms", () => {
  it("uses writer-friendly labels by default", () => {
    expect(versionTerm("es", false, "versionStageAction")).toBe("Preparar");
    expect(versionTerm("es", false, "versionStagedSummary", {
      count: "2",
      total: "5",
    })).toBe("2 de 5 preparados");
  });

  it("uses Git vocabulary in developer mode", () => {
    expect(versionTerm("es", true, "versionStageAction")).toBe("Stage");
    expect(versionTerm("es", true, "versionsSave")).toBe("Commit");
    expect(versionTerm("es", true, "versionStagedSummary", {
      count: "2",
      total: "5",
    })).toBe("2 of 5 staged");
  });
});
