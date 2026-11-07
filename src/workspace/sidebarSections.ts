import type { IconName } from "../ui/icons";

export const SIDEBAR_SECTIONS = [
  {
    id: "files",
    titleKey: "explorerTitle",
    labelKey: "filesTab",
    icon: "files",
  },
  {
    id: "outline",
    titleKey: "outlineTitle",
    labelKey: "outlineTab",
    icon: "list-tree",
  },
  {
    id: "versions",
    titleKey: "versionsTitle",
    labelKey: "versionsTab",
    icon: "history",
  },
] as const satisfies ReadonlyArray<{
  id: string;
  titleKey: string;
  labelKey: string;
  icon: IconName;
}>;

export type SidebarTab = (typeof SIDEBAR_SECTIONS)[number]["id"];
