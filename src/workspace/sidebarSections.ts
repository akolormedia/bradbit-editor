export const SIDEBAR_SECTIONS = [
  {
    id: "files",
    titleKey: "explorerTitle",
    labelKey: "filesTab",
    icon: "▤",
  },
  {
    id: "outline",
    titleKey: "outlineTitle",
    labelKey: "outlineTab",
    icon: "☰",
  },
  {
    id: "versions",
    titleKey: "versionsTitle",
    labelKey: "versionsTab",
    icon: "◷",
  },
] as const;

export type SidebarTab = (typeof SIDEBAR_SECTIONS)[number]["id"];
