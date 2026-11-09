export type ColorThemeId = "bradbit" | "nord" | "solarized" | "gruvbox";

export type ColorMode = "light" | "dark";

export interface ColorPalette {
  bgApp: string;
  bgSidebar: string;
  bgSurface: string;
  bgElevated: string;
  bgEditor: string;
  bgInput: string;
  bgHover: string;
  bgActive: string;
  bgActiveLine: string;
  bgSelection: string;
  borderColor: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentHover: string;
  danger: string;
  success: string;
  cmHeading: string;
  cmKeyword: string;
  cmCharacter: string;
  cmDialogue: string;
  cmParenthetical: string;
}

export interface ColorThemeDefinition {
  id: ColorThemeId;
  labelKey:
    | "colorThemeBradbit"
    | "colorThemeNord"
    | "colorThemeSolarized"
    | "colorThemeGruvbox";
  light?: ColorPalette;
  dark?: ColorPalette;
}

/** CSS custom properties written on the document root for a color theme. */
export const PALETTE_TOKENS: Array<[keyof ColorPalette, string]> = [
  ["bgApp", "--bg-app"],
  ["bgSidebar", "--bg-sidebar"],
  ["bgSurface", "--bg-surface"],
  ["bgElevated", "--bg-elevated"],
  ["bgEditor", "--bg-editor"],
  ["bgInput", "--bg-input"],
  ["bgHover", "--bg-hover"],
  ["bgActive", "--bg-active"],
  ["bgActiveLine", "--bg-active-line"],
  ["bgSelection", "--bg-selection"],
  ["borderColor", "--border-color"],
  ["textPrimary", "--text-primary"],
  ["textSecondary", "--text-secondary"],
  ["textMuted", "--text-muted"],
  ["accent", "--accent"],
  ["accentHover", "--accent-hover"],
  ["danger", "--danger"],
  ["success", "--success"],
  ["cmHeading", "--cm-heading"],
  ["cmKeyword", "--cm-keyword"],
  ["cmCharacter", "--cm-character"],
  ["cmDialogue", "--cm-dialogue"],
  ["cmParenthetical", "--cm-parenthetical"],
];

export const COLOR_THEMES: ColorThemeDefinition[] = [
  { id: "bradbit", labelKey: "colorThemeBradbit" },
  {
    id: "nord",
    labelKey: "colorThemeNord",
    light: {
      bgApp: "#eceff4",
      bgSidebar: "#e5e9f0",
      bgSurface: "#d8dee9",
      bgElevated: "#ffffff",
      bgEditor: "#f7f9fb",
      bgInput: "#ffffff",
      bgHover: "rgba(46, 52, 64, 0.06)",
      bgActive: "rgba(94, 129, 172, 0.15)",
      bgActiveLine: "rgba(0, 0, 0, 0.03)",
      bgSelection: "rgba(94, 129, 172, 0.22)",
      borderColor: "#c2cad8",
      textPrimary: "#2e3440",
      textSecondary: "#4c566a",
      textMuted: "#6f7b8c",
      accent: "#5e81ac",
      accentHover: "#4c6f99",
      danger: "#bf616a",
      success: "#4f8a5b",
      cmHeading: "#5e81ac",
      cmKeyword: "#b48a2f",
      cmCharacter: "#4f8a5b",
      cmDialogue: "#a54b55",
      cmParenthetical: "#7c5f8f",
    },
    dark: {
      bgApp: "#2e3440",
      bgSidebar: "#343b48",
      bgSurface: "#3b4252",
      bgElevated: "#434c5e",
      bgEditor: "#2b303b",
      bgInput: "#272c36",
      bgHover: "rgba(216, 222, 233, 0.08)",
      bgActive: "rgba(136, 192, 208, 0.18)",
      bgActiveLine: "rgba(255, 255, 255, 0.03)",
      bgSelection: "rgba(136, 192, 208, 0.28)",
      borderColor: "#4c566a",
      textPrimary: "#eceff4",
      textSecondary: "#d8dee9",
      textMuted: "#8f9aae",
      accent: "#88c0d0",
      accentHover: "#9fd0de",
      danger: "#bf616a",
      success: "#a3be8c",
      cmHeading: "#88c0d0",
      cmKeyword: "#ebcb8b",
      cmCharacter: "#a3be8c",
      cmDialogue: "#bf616a",
      cmParenthetical: "#b48ead",
    },
  },
  {
    id: "solarized",
    labelKey: "colorThemeSolarized",
    light: {
      bgApp: "#fdf6e3",
      bgSidebar: "#f5efdc",
      bgSurface: "#eee8d5",
      bgElevated: "#fffaf0",
      bgEditor: "#fffdf5",
      bgInput: "#fffaf0",
      bgHover: "rgba(88, 110, 117, 0.07)",
      bgActive: "rgba(38, 139, 210, 0.14)",
      bgActiveLine: "rgba(0, 0, 0, 0.03)",
      bgSelection: "rgba(38, 139, 210, 0.20)",
      borderColor: "#ddd6c1",
      textPrimary: "#073642",
      textSecondary: "#586e75",
      textMuted: "#839496",
      accent: "#268bd2",
      accentHover: "#1a6fa8",
      danger: "#dc322f",
      success: "#6b8e00",
      cmHeading: "#268bd2",
      cmKeyword: "#a67c00",
      cmCharacter: "#6b8e00",
      cmDialogue: "#b02b28",
      cmParenthetical: "#6c71c4",
    },
    dark: {
      bgApp: "#002b36",
      bgSidebar: "#073642",
      bgSurface: "#0b3d4a",
      bgElevated: "#0f4653",
      bgEditor: "#00252f",
      bgInput: "#001f27",
      bgHover: "rgba(147, 161, 161, 0.10)",
      bgActive: "rgba(38, 139, 210, 0.20)",
      bgActiveLine: "rgba(255, 255, 255, 0.03)",
      bgSelection: "rgba(38, 139, 210, 0.28)",
      borderColor: "#1f5563",
      textPrimary: "#eee8d5",
      textSecondary: "#93a1a1",
      textMuted: "#6b8588",
      accent: "#268bd2",
      accentHover: "#3aa0e6",
      danger: "#dc322f",
      success: "#859900",
      cmHeading: "#268bd2",
      cmKeyword: "#b58900",
      cmCharacter: "#859900",
      cmDialogue: "#dc322f",
      cmParenthetical: "#6c71c4",
    },
  },
  {
    id: "gruvbox",
    labelKey: "colorThemeGruvbox",
    light: {
      bgApp: "#fbf1c7",
      bgSidebar: "#f2e5bc",
      bgSurface: "#ebdbb2",
      bgElevated: "#fff7d6",
      bgEditor: "#fdf6d8",
      bgInput: "#fff7d6",
      bgHover: "rgba(60, 56, 54, 0.07)",
      bgActive: "rgba(175, 58, 3, 0.12)",
      bgActiveLine: "rgba(0, 0, 0, 0.03)",
      bgSelection: "rgba(175, 58, 3, 0.18)",
      borderColor: "#d5c4a1",
      textPrimary: "#3c3836",
      textSecondary: "#504945",
      textMuted: "#7c6f64",
      accent: "#af3a03",
      accentHover: "#8f2f02",
      danger: "#9d0006",
      success: "#79740e",
      cmHeading: "#076678",
      cmKeyword: "#b57614",
      cmCharacter: "#79740e",
      cmDialogue: "#9d0006",
      cmParenthetical: "#8f3f71",
    },
    dark: {
      bgApp: "#1d2021",
      bgSidebar: "#282828",
      bgSurface: "#32302f",
      bgElevated: "#3c3836",
      bgEditor: "#1e2021",
      bgInput: "#17191a",
      bgHover: "rgba(235, 219, 178, 0.08)",
      bgActive: "rgba(215, 153, 33, 0.18)",
      bgActiveLine: "rgba(255, 255, 255, 0.03)",
      bgSelection: "rgba(215, 153, 33, 0.28)",
      borderColor: "#504945",
      textPrimary: "#ebdbb2",
      textSecondary: "#d5c4a1",
      textMuted: "#928374",
      accent: "#d79921",
      accentHover: "#e6a82e",
      danger: "#fb4934",
      success: "#b8bb26",
      cmHeading: "#83a598",
      cmKeyword: "#fabd2f",
      cmCharacter: "#b8bb26",
      cmDialogue: "#fb4934",
      cmParenthetical: "#d3869b",
    },
  },
];

export function findColorTheme(id: string): ColorThemeDefinition | undefined {
  return COLOR_THEMES.find((theme) => theme.id === id);
}

/**
 * Applies a color family to the document root. The Bradbit family clears the
 * inline overrides so the base stylesheet keeps providing the default palette.
 */
export function applyColorTheme(id: string, mode: ColorMode): void {
  const root = document.documentElement;
  const theme = findColorTheme(id);
  const palette = theme?.id === "bradbit" ? undefined : theme?.[mode];
  for (const [key, token] of PALETTE_TOKENS) {
    if (palette) {
      root.style.setProperty(token, palette[key]);
    } else {
      root.style.removeProperty(token);
    }
  }
}

/** Resolves the effective light/dark mode from the theme setting. */
export function resolveColorMode(
  setting: "dark" | "light" | "system",
  prefersLight: boolean,
): ColorMode {
  if (setting === "system") return prefersLight ? "light" : "dark";
  return setting;
}
