// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createVersionStatus } from "./versionStatus";

describe("version status marks (T-3.11.7)", () => {
  it("renders an outlined icon with an accessible label", () => {
    const added = createVersionStatus("added", "es");
    expect(added.className).toContain("version-status-added");
    expect(added.getAttribute("aria-label")).toBe("Nuevo");
    expect(added.querySelector("svg")).not.toBeNull();

    const deleted = createVersionStatus("deleted", "en");
    expect(deleted.className).toContain("version-status-deleted");
    expect(deleted.getAttribute("aria-label")).toBe("Deleted");

    const developer = createVersionStatus("modified", "es", true);
    expect(developer.getAttribute("aria-label")).toBe("Modified");
  });
});
