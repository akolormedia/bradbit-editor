import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Clapperboard,
  Code,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Eye,
  File,
  FileDiff,
  FilePlus2,
  FileText,
  Files,
  Film,
  Folder,
  FolderOpen,
  FolderPlus,
  FolderX,
  GitBranch,
  Github,
  Hash,
  History,
  Image,
  ListTree,
  Menu,
  Palette,
  MessageSquare,
  PanelLeft,
  PanelRight,
  Pencil,
  PenLine,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Settings,
  SlidersHorizontal,
  Slash,
  Square,
  Terminal,
  Trash2,
  TriangleAlert,
  X,
  type IconNode,
} from "lucide";

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Central registry of monochrome line icons used by the app chrome.
 *
 * Keeping the registry in one place guarantees a consistent stroke, size and
 * accessibility contract for every icon button in the shell.
 */
export const ICON_NODES = {
  "arrow-up": ArrowUp,
  "arrow-up-right": ArrowUpRight,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  circle: Circle,
  clapperboard: Clapperboard,
  code: Code,
  copy: Copy,
  download: Download,
  eraser: Eraser,
  "external-link": ExternalLink,
  eye: Eye,
  file: File,
  "file-diff": FileDiff,
  "file-plus": FilePlus2,
  "file-text": FileText,
  files: Files,
  film: Film,
  folder: Folder,
  "folder-open": FolderOpen,
  "folder-plus": FolderPlus,
  "folder-x": FolderX,
  "git-branch": GitBranch,
  github: Github,
  hash: Hash,
  history: History,
  image: Image,
  "list-tree": ListTree,
  menu: Menu,
  "message-square": MessageSquare,
  "panel-left": PanelLeft,
  "panel-right": PanelRight,
  palette: Palette,
  pencil: Pencil,
  "pen-line": PenLine,
  plus: Plus,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  save: Save,
  search: Search,
  settings: Settings,
  slash: Slash,
  "sliders-horizontal": SlidersHorizontal,
  square: Square,
  terminal: Terminal,
  trash: Trash2,
  "triangle-alert": TriangleAlert,
  x: X,
} satisfies Record<string, IconNode>;

export type IconName = keyof typeof ICON_NODES;

export function hasIcon(name: string): name is IconName {
  return name in ICON_NODES;
}

/**
 * Creates an inline SVG icon from the Lucide node data.
 *
 * The SVG inherits the current text color (`currentColor`) and renders with a
 * uniform 1.75 stroke, so icons stay monochrome in both light and dark themes.
 */
export function createIcon(name: IconName, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("xmlns", SVG_NS);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.75");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("icon", `icon-${name}`);

  for (const [tag, attrs] of ICON_NODES[name]) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
      node.setAttribute(key, String(value));
    }
    svg.appendChild(node);
  }
  return svg;
}

/** Prepends a line icon to an existing text button. */
export function prependIcon(
  button: HTMLButtonElement,
  name: IconName,
  size = 14,
): HTMLButtonElement {
  button.prepend(createIcon(name, size));
  return button;
}
