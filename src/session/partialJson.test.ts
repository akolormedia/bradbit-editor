import { describe, expect, it } from "vitest";
import { readPartialJsonString } from "./partialJson";

describe("partial JSON strings", () => {
  it("reads path and content while the object is still incomplete", () => {
    const raw =
      '{"path":"script/capitulo-1.fountain","content":"INT. CASA - DÍA\\n\\nLa puerta se abre.';
    expect(readPartialJsonString(raw, "path")).toBe(
      "script/capitulo-1.fountain",
    );
    expect(readPartialJsonString(raw, "content")).toBe(
      "INT. CASA - DÍA\n\nLa puerta se abre.",
    );
  });

  it("stops before incomplete escapes and resumes with the next delta", () => {
    expect(readPartialJsonString('{"content":"Hola\\', "content")).toBe("Hola");
    expect(readPartialJsonString('{"content":"Hola\\u00', "content")).toBe(
      "Hola",
    );
    expect(readPartialJsonString('{"content":"Hola\\u00e1"', "content")).toBe(
      "Holaá",
    );
  });

  it("does not confuse keys inside the content string", () => {
    const raw =
      '{"path":"notas.md","content":"Escribe \\"content\\": algo y \\"path\\": otra cosa."}';
    expect(readPartialJsonString(raw, "content")).toBe(
      'Escribe "content": algo y "path": otra cosa.',
    );
  });

  it("returns null until the key and its string value start", () => {
    expect(readPartialJsonString("", "content")).toBeNull();
    expect(readPartialJsonString('{"pa', "path")).toBeNull();
    expect(readPartialJsonString('{"path":', "path")).toBeNull();
    expect(readPartialJsonString('{"other":"x"}', "path")).toBeNull();
  });
});
