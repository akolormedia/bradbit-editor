import { describe, expect, it } from "vitest";
import { translations } from "./index";

const runtimeKeys = [
  "chatErrorTitle",
  "chatErrorNoResponse",
  "chatErrorConnectionLost",
  "chatErrorConfigureModels",
  "chatPermissionTitle",
  "chatModelsEmpty",
  "terminalCommandOpenCode",
  "settingsTerminalCommandHint",
] as const;

describe("agent runtime translations (T-3.1.8)", () => {
  it("does not send writers to an OpenCode install or terminal command", () => {
    for (const language of ["es", "en"] as const) {
      for (const key of runtimeKeys) {
        const value = translations[language][key];
        expect(value).toBeTruthy();
        expect(value.toLowerCase()).not.toContain("opencode");
      }
      expect(translations[language].terminalCommandOpenCode).toBe("Bradbit");
      expect(translations[language].chatErrorConfigureModels).toContain(
        language === "es" ? "Configurar" : "Configure",
      );
    }
  });
});
