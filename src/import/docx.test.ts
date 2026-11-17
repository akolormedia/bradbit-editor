// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { convertDocxToMarkdown } from "./docx";

const root = process.cwd();

function fixtureBuffer(): ArrayBuffer {
  const file = readFileSync(path.join(root, "src/docs/fixtures/sample.docx"));
  return Uint8Array.from(file).buffer;
}

describe("DOCX to Markdown import (T-3.8.2)", () => {
  it("keeps headings, paragraphs and basic emphasis", async () => {
    const result = await convertDocxToMarkdown(fixtureBuffer());

    expect(result.markdown).toContain("# Chapter One");
    expect(result.markdown).toContain("## Scene");
    expect(result.markdown).toContain("**Mara**");
    expect(result.markdown).toContain("*without looking at him*");
    expect(result.markdown).toContain("—No vine a quedarme —dijo Mara.");
    expect(result.words).toBeGreaterThan(10);
    expect(result.headings).toBeGreaterThanOrEqual(2);
  });

  it("drops images and tables, and reports what was lost", async () => {
    const result = await convertDocxToMarkdown(fixtureBuffer());

    expect(result.images).toBe(1);
    expect(result.tables).toBe(1);
    expect(result.warnings).toEqual(
      expect.arrayContaining(["images", "tables", "comments", "trackedChanges"]),
    );
    expect(result.markdown).not.toContain("data:image");
    expect(result.markdown).not.toContain("Protagonist");
    expect(result.markdown).toContain("Last line after the image.");
  });
});
