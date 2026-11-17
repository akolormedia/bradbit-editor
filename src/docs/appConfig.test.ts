import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../../", import.meta.url));

describe("app security configuration (T-3.8.1)", () => {
  it("disables the WebView inspector in the packaged app", () => {
    const tauri = JSON.parse(
      readFileSync(path.join(root, "src-tauri/tauri.conf.json"), "utf8"),
    ) as {
      app?: { windows?: Array<{ devtools?: boolean }> };
    };

    expect(tauri.app?.windows?.[0]?.devtools).toBe(false);
  });
});
