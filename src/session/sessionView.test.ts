import { describe, expect, it } from "vitest";
import { toggleSessionView } from "./sessionView";

describe("session view (T-2.3.1)", () => {
  it("switches between chat and terminal", () => {
    expect(toggleSessionView("chat")).toBe("terminal");
    expect(toggleSessionView("terminal")).toBe("chat");
  });
});
