import { describe, expect, it } from "vitest";
import { addSessionTab, removeSessionTab } from "./sessionTabs";

describe("session tabs (T-2.1.2)", () => {
  it("removes the active tab and picks the adjacent session", () => {
    expect(removeSessionTab(["a", "b", "c"], "b", "b")).toEqual({
      openIds: ["a", "c"],
      activeId: "c",
    });
    expect(removeSessionTab(["a", "b"], "b", "b")).toEqual({
      openIds: ["a"],
      activeId: "a",
    });
    expect(removeSessionTab(["a"], "a", "a")).toEqual({
      openIds: [],
      activeId: null,
    });
  });

  it("keeps the active tab when closing another session", () => {
    expect(removeSessionTab(["a", "b"], "a", "b")).toEqual({
      openIds: ["a"],
      activeId: "a",
    });
  });

  it("ignores unknown removals and duplicate additions", () => {
    expect(removeSessionTab(["a"], "a", "missing")).toEqual({
      openIds: ["a"],
      activeId: "a",
    });
    expect(addSessionTab(["a"], "b")).toEqual(["a", "b"]);
    expect(addSessionTab(["a", "b"], "b")).toEqual(["a", "b"]);
  });
});
