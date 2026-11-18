import { describe, expect, it } from "vitest";
import { folderPdfErrorCopy } from "./folderPdfError";
import { FolderPdfError } from "../types";

const error = (patch: Partial<FolderPdfError>): FolderPdfError => ({
  code: "mixed",
  markdown: 0,
  fountain: 0,
  message: "",
  ...patch,
});

describe("folder PDF error copy", () => {
  it("explains a mixed folder with counts and a concrete next step", () => {
    const copy = folderPdfErrorCopy(
      error({
        code: "mixed",
        folder: "guion",
        markdown: 2,
        fountain: 1,
        message: "internal",
      }),
      "es",
    );
    expect(copy.message).toContain("guion");
    expect(copy.message).toContain("Markdown (2)");
    expect(copy.message).toContain("Fountain (1)");
    expect(copy.hint).toContain("manuscript/");
    expect(copy.hint).toContain("script/");
  });

  it("explains an empty folder and keeps the technical detail for I/O errors", () => {
    const empty = folderPdfErrorCopy(
      error({ code: "empty", folder: "notas" }),
      "en",
    );
    expect(empty.message).toContain("notas");
    expect(empty.hint).toContain(".md");

    const io = folderPdfErrorCopy(
      error({ code: "io", message: "Permission denied" }),
      "en",
    );
    expect(io.message).toContain("could not be read or written");
    expect(io.detail).toBe("Permission denied");
  });
});
