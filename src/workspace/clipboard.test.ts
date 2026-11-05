// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "./clipboard";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("clipboard helper (T-1.2.1)", () => {
  it("uses the async clipboard API when available", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    await expect(copyTextToClipboard("Hola")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("Hola");
  });

  it("falls back to execCommand when the clipboard API fails", async () => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
    });
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: execCommand,
    });

    await expect(copyTextToClipboard("Hola")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
