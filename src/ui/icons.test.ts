// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createIcon, hasIcon, ICON_NODES, IconName } from "./icons";
import { createIconButton } from "./iconButton";

describe("line icon system (T-2.4.1)", () => {
  it("renders every registered icon as a monochrome SVG line icon", () => {
    for (const name of Object.keys(ICON_NODES) as IconName[]) {
      const svg = createIcon(name, 18);
      expect(svg.tagName.toLowerCase()).toBe("svg");
      expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
      expect(svg.getAttribute("width")).toBe("18");
      expect(svg.getAttribute("height")).toBe("18");
      expect(svg.getAttribute("fill")).toBe("none");
      expect(svg.getAttribute("stroke")).toBe("currentColor");
      expect(svg.getAttribute("stroke-width")).toBe("1.75");
      expect(svg.getAttribute("aria-hidden")).toBe("true");
      expect(svg.childElementCount).toBeGreaterThan(0);
    }
  });

  it("recognizes only registered icon names", () => {
    expect(hasIcon("settings")).toBe(true);
    expect(hasIcon("not-a-real-icon")).toBe(false);
  });

  it("builds a fixed-size, accessible icon button with state and click handling", () => {
    const onClick = vi.fn();
    const button = createIconButton({
      icon: "settings",
      label: "Ajustes",
      active: true,
      onClick,
    });

    expect(button.tagName).toBe("BUTTON");
    expect(button.classList.contains("icon-button")).toBe(true);
    expect(button.classList.contains("icon-btn")).toBe(true);
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).toBe("");
    expect(button.title).toBe("Ajustes");
    expect(button.getAttribute("aria-label")).toBe("Ajustes");
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.classList.contains("active")).toBe(true);

    button.click();
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("supports plain, disabled and test-id variants", () => {
    const button = createIconButton({
      icon: "x",
      label: "Cerrar",
      className: "tree-mini-btn",
      testId: "close-button",
      disabled: true,
      plain: true,
    });

    expect(button.classList.contains("icon-btn")).toBe(false);
    expect(button.classList.contains("icon-button")).toBe(true);
    expect(button.classList.contains("tree-mini-btn")).toBe(true);
    expect(button.dataset.testid).toBe("close-button");
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-pressed")).toBeNull();
  });
});
