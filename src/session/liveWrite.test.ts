import { describe, expect, it } from "vitest";
import { applyLiveEdit, revealLiveWriteContent } from "./liveWrite";

describe("live write animation", () => {
  it("reveals short content in small steps and finishes", () => {
    let revealed = "";
    let steps = 0;
    while (revealed.length < 10) {
      revealed = revealLiveWriteContent("0123456789", revealed);
      steps += 1;
    }
    expect(revealed).toBe("0123456789");
    expect(steps).toBeGreaterThan(1);
  });

  it("catches up a large chapter in bounded chunks", () => {
    const target = "a".repeat(24_000);
    const next = revealLiveWriteContent(target, "");
    expect(next.length).toBe(200);
    expect(next).toBe(target.slice(0, 200));
  });

  it("applies the first edit or every occurrence", () => {
    expect(applyLiveEdit("uno dos uno", "uno", "tres", false)).toBe(
      "tres dos uno",
    );
    expect(applyLiveEdit("uno dos uno", "uno", "tres", true)).toBe(
      "tres dos tres",
    );
    expect(applyLiveEdit("uno dos", "falta", "tres", false)).toBe("uno dos");
    expect(applyLiveEdit("uno", "uno", "", false)).toBe("");
  });

  it("keeps a shared prefix when the target changes", () => {
    expect(revealLiveWriteContent("abcdef", "abc")).toBe("abcdef");
    expect(revealLiveWriteContent("xyzxyz", "abc")).toBe("xyz");
  });
});
