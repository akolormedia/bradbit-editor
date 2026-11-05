import {
  AppSettings,
  CreatedProject,
  FileTreeNode,
  MenuCommand,
  MenuUiState,
  OpenedFolder,
  RecentProject,
  SearchMatch,
  TemplateInfo,
} from "../types";
import { DEFAULT_SETTINGS, isAlwaysHiddenEntry, isConfigEntry } from "../workspace/state";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

// --- Browser fallback store (used when testing in standalone Vite browser) ---
const BROWSER_SETTINGS_KEY = "bradbit.settings.v1";
const BROWSER_RECENTS_KEY = "bradbit.recents.v1";

interface VirtualFs {
  rootPath: string;
  name: string;
  files: Record<string, string>;
  dirs: Set<string>;
}

const DEMO_GUIONISTA_KIT: VirtualFs = {
  rootPath: "/Users/rafaelolivares/Documents/GitHub/guionista-kit",
  name: "guionista-kit",
  dirs: new Set([
    "biblia",
    "biblia/personajes",
    "biblia/mundo",
    "estructura",
    "guion",
    "investigacion",
    "notas",
    ".opencode",
    ".opencode/agents",
    ".opencode/commands",
  ]),
  files: {
    "README.md": `# guionista-kit\n\nPlantilla base para proyectos de guion (largometraje, serie, micro drama) trabajados con opencode.\n`,
    "AGENTS.md": `# Instrucciones base del proyecto\n\nEste archivo lo lee opencode al iniciar. La biblia es la fuente de verdad del universo narrativo.\n`,
    "biblia/premisa.md": `# Premisa\n\n**Logline:** Una archivista descubre cintas inéditas que contradicen la historia oficial de su ciudad.\n\n**Tema:** La memoria frente al olvido impuesto.\n`,
    "biblia/cronologia.md": `# Cronología\n\n- **1998:** Desaparición del archivo municipal.\n- **Presente:** Elena encuentra la primera caja en el sótano.\n`,
    "biblia/personajes/_template.md": `# Nombre del Personaje\n\n- **Edad:** \n- **Deseo consciente:** \n- **Necesidad inconsciente:** \n`,
    "biblia/mundo/_template.md": `# Reglas del Mundo y Locaciones\n\nDescribe aquí los espacios principales de la historia.\n`,
    "estructura/escaleta.md": `# Escaleta — Acto I\n\n1. **INT. ARCHIVO MUNICIPAL - NOCHE:** Elena cataloga cajas húmedas antes del cierre.\n2. **EXT. CALLEJÓN CENTRAL - NOCHE:** Encuentro con el antiguo proyeccionista.\n`,
    "guion/episodio-1.fountain": `Title: EL ARCHIVO DEL SILENCIO\nCredit: Escrito por\nAuthor: Equipo Creativo\nDraft date: 2026\n\n# ACTO I\n\nINT. ARCHIVO MUNICIPAL - NOCHE\n\nUn sótano largo iluminado por tubos fluorescentes que parpadean. Cajas de cartón apiladas hasta el techo.\n\nELENA (34), manos manchadas de polvo, sostiene una bobina de 16mm contra la luz.\n\nELENA\n(en voz baja)\nEsto no estaba en el inventario.\n\nUn GOLPE SECO resuena al fondo del pasillo.\n\nCORTE A:\n`,
    ".opencode/agents/guionista.md": `---\nname: guionista\ndescription: Escribe ideas, personajes, estructura, escaletas y borradores de escena.\n---\n\n# Agente: guionista\nRol de escritura activa.\n`,
    ".opencode/commands/escena.md": `---\nname: escena\ndescription: "Escribe el borrador de una escena de la escaleta."\nagent: guionista\n---\nUsa el skill escribir-escena.\n`,
  },
};

let activeVirtualFs: VirtualFs = structuredClone(DEMO_GUIONISTA_KIT);

function buildVirtualTree(vfs: VirtualFs, showConfig: boolean): FileTreeNode[] {
  const dirMap = new Map<string, FileTreeNode>();
  const rootNodes: FileTreeNode[] = [];

  const ensureDir = (dirPath: string): FileTreeNode => {
    const existing = dirMap.get(dirPath);
    if (existing) return existing;
    const parts = dirPath.split("/");
    const name = parts[parts.length - 1];
    const node: FileTreeNode = {
      name,
      path: dirPath,
      isDir: true,
      isConfig: isConfigEntry(name),
      children: [],
    };
    dirMap.set(dirPath, node);
    if (parts.length === 1) {
      rootNodes.push(node);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureDir(parentPath);
      parent.children!.push(node);
    }
    return node;
  };

  for (const dir of Array.from(vfs.dirs).sort()) {
    const topName = dir.split("/")[0];
    if (isAlwaysHiddenEntry(topName)) continue;
    if (!showConfig && isConfigEntry(topName)) continue;
    ensureDir(dir);
  }

  for (const filePath of Object.keys(vfs.files).sort()) {
    const parts = filePath.split("/");
    const name = parts[parts.length - 1];
    const topName = parts[0];
    if (isAlwaysHiddenEntry(topName) || isAlwaysHiddenEntry(name)) continue;
    if (!showConfig && (isConfigEntry(topName) || isConfigEntry(name))) continue;

    const fileNode: FileTreeNode = {
      name,
      path: filePath,
      isDir: false,
      isConfig: isConfigEntry(name) || isConfigEntry(topName),
    };
    if (parts.length === 1) {
      rootNodes.push(fileNode);
    } else {
      const parentPath = parts.slice(0, -1).join("/");
      const parent = ensureDir(parentPath);
      parent.children!.push(fileNode);
    }
  }

  const sortTree = (nodes: FileTreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });
    for (const n of nodes) {
      if (n.children) sortTree(n.children);
    }
  };
  sortTree(rootNodes);
  return rootNodes;
}

export const backend = {
  async loadSettings(): Promise<AppSettings> {
    if (isTauriEnvironment()) {
      return tauriInvoke<AppSettings>("load_settings");
    }
    try {
      const raw = localStorage.getItem(BROWSER_SETTINGS_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  },

  async saveSettings(settings: AppSettings): Promise<AppSettings> {
    if (isTauriEnvironment()) {
      return tauriInvoke<AppSettings>("save_settings", { settings });
    }
    localStorage.setItem(BROWSER_SETTINGS_KEY, JSON.stringify(settings));
    return settings;
  },

  async listRecentProjects(): Promise<RecentProject[]> {
    if (isTauriEnvironment()) {
      return tauriInvoke<RecentProject[]>("list_recent_projects");
    }
    try {
      const raw = localStorage.getItem(BROWSER_RECENTS_KEY);
      if (!raw) {
        return [
          {
            path: DEMO_GUIONISTA_KIT.rootPath,
            name: DEMO_GUIONISTA_KIT.name,
            lastOpened: new Date().toISOString(),
          },
        ];
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  async removeRecentProject(path: string): Promise<RecentProject[]> {
    if (isTauriEnvironment()) {
      return tauriInvoke<RecentProject[]>("remove_recent_project", { path });
    }
    const list = (await this.listRecentProjects()).filter((p) => p.path !== path);
    localStorage.setItem(BROWSER_RECENTS_KEY, JSON.stringify(list));
    return list;
  },

  async pickFolderDialog(): Promise<string | null> {
    if (isTauriEnvironment()) {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
      });
      return typeof selected === "string" ? selected : null;
    }
    return DEMO_GUIONISTA_KIT.rootPath;
  },

  async openFolder(path: string, showConfigFiles: boolean): Promise<OpenedFolder> {
    if (isTauriEnvironment()) {
      return tauriInvoke<OpenedFolder>("open_folder", {
        path,
        showConfig: showConfigFiles,
      });
    }
    const name = path.split("/").filter(Boolean).pop() || "proyecto";
    if (path !== activeVirtualFs.rootPath) {
      activeVirtualFs = {
        ...structuredClone(DEMO_GUIONISTA_KIT),
        rootPath: path,
        name,
      };
    }
    const recents = (await this.listRecentProjects()).filter((r) => r.path !== path);
    recents.unshift({ path, name, lastOpened: new Date().toISOString() });
    localStorage.setItem(BROWSER_RECENTS_KEY, JSON.stringify(recents.slice(0, 10)));
    return {
      rootPath: activeVirtualFs.rootPath,
      name: activeVirtualFs.name,
      tree: buildVirtualTree(activeVirtualFs, showConfigFiles),
    };
  },

  async listDirectoryTree(rootPath: string, showConfigFiles: boolean): Promise<FileTreeNode[]> {
    if (isTauriEnvironment()) {
      return tauriInvoke<FileTreeNode[]>("list_directory_tree", {
        root: rootPath,
        showConfig: showConfigFiles,
      });
    }
    return buildVirtualTree(activeVirtualFs, showConfigFiles);
  },

  async readTextFile(rootPath: string, relPath: string): Promise<string> {
    if (isTauriEnvironment()) {
      return tauriInvoke<string>("read_text_file", {
        root: rootPath,
        relPath,
      });
    }
    if (!(relPath in activeVirtualFs.files)) {
      throw new Error(`Archivo no encontrado: ${relPath}`);
    }
    return activeVirtualFs.files[relPath];
  },

  async writeTextFile(rootPath: string, relPath: string, content: string): Promise<void> {
    if (isTauriEnvironment()) {
      await tauriInvoke<void>("write_text_file", {
        root: rootPath,
        relPath,
        content,
      });
      return;
    }
    activeVirtualFs.files[relPath] = content;
  },

  async createEntry(rootPath: string, relPath: string, isDir: boolean): Promise<void> {
    if (isTauriEnvironment()) {
      await tauriInvoke<void>("create_entry", {
        root: rootPath,
        relPath,
        isDir,
      });
      return;
    }
    const clean = relPath.replace(/^\/+|\/+$/g, "");
    if (!clean || clean.includes("..")) {
      throw new Error("Ruta inválida");
    }
    if (isDir) {
      activeVirtualFs.dirs.add(clean);
    } else {
      if (clean in activeVirtualFs.files) {
        throw new Error(`El archivo ya existe: ${clean}`);
      }
      const parts = clean.split("/");
      if (parts.length > 1) {
        activeVirtualFs.dirs.add(parts.slice(0, -1).join("/"));
      }
      activeVirtualFs.files[clean] = "";
    }
  },

  async renameEntry(rootPath: string, oldRelPath: string, newRelPath: string): Promise<void> {
    if (isTauriEnvironment()) {
      await tauriInvoke<void>("rename_entry", {
        root: rootPath,
        oldRelPath,
        newRelPath,
      });
      return;
    }
    const cleanNew = newRelPath.replace(/^\/+|\/+$/g, "");
    if (!cleanNew || cleanNew.includes("..")) {
      throw new Error("Ruta inválida");
    }
    if (oldRelPath in activeVirtualFs.files) {
      if (cleanNew in activeVirtualFs.files) {
        throw new Error("Ya existe un archivo con ese nombre");
      }
      activeVirtualFs.files[cleanNew] = activeVirtualFs.files[oldRelPath];
      delete activeVirtualFs.files[oldRelPath];
      return;
    }
    if (activeVirtualFs.dirs.has(oldRelPath)) {
      activeVirtualFs.dirs.delete(oldRelPath);
      activeVirtualFs.dirs.add(cleanNew);
      for (const [k, v] of Object.entries(activeVirtualFs.files)) {
        if (k.startsWith(`${oldRelPath}/`)) {
          const nextKey = `${cleanNew}${k.slice(oldRelPath.length)}`;
          activeVirtualFs.files[nextKey] = v;
          delete activeVirtualFs.files[k];
        }
      }
    }
  },

  async deleteEntry(rootPath: string, relPath: string): Promise<void> {
    if (isTauriEnvironment()) {
      await tauriInvoke<void>("delete_entry", {
        root: rootPath,
        relPath,
      });
      return;
    }
    delete activeVirtualFs.files[relPath];
    activeVirtualFs.dirs.delete(relPath);
    for (const k of Object.keys(activeVirtualFs.files)) {
      if (k.startsWith(`${relPath}/`)) {
        delete activeVirtualFs.files[k];
      }
    }
    for (const d of Array.from(activeVirtualFs.dirs)) {
      if (d.startsWith(`${relPath}/`)) {
        activeVirtualFs.dirs.delete(d);
      }
    }
  },

  async refreshMenu(state: MenuUiState): Promise<void> {
    if (isTauriEnvironment()) {
      await tauriInvoke<void>("refresh_menu", { state });
    }
  },

  async listenMenuCommands(handler: (command: MenuCommand) => void): Promise<() => void> {
    if (!isTauriEnvironment()) {
      return () => {};
    }
    const { listen } = await import("@tauri-apps/api/event");
    return listen<MenuCommand>("bradbit-menu", (event) => handler(event.payload));
  },

  async openExternalUrl(url: string): Promise<void> {
    if (isTauriEnvironment()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  },

  async exportFountainPdf(
    rootPath: string,
    relPath: string,
    content: string,
  ): Promise<string> {
    if (!isTauriEnvironment()) {
      throw new Error("La exportación a PDF requiere la app de escritorio");
    }
    return tauriInvoke<string>("export_fountain_pdf", {
      root: rootPath,
      relPath,
      content,
    });
  },

  async searchInFolder(
    rootPath: string,
    query: string,
    maxResults = 200,
    includeConfig = false,
  ): Promise<SearchMatch[]> {
    if (isTauriEnvironment()) {
      return tauriInvoke<SearchMatch[]>("search_in_folder", {
        root: rootPath,
        query,
        maxResults,
        includeConfig,
      });
    }

    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return [];
    const results: SearchMatch[] = [];
    for (const [path, content] of Object.entries(activeVirtualFs.files)) {
      if (!includeConfig && isConfigSearchPath(path)) continue;
      const lines = content.split(/\r?\n/);
      for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const matchIndex = line.toLowerCase().indexOf(needle);
        if (matchIndex < 0) continue;
        results.push({
          path,
          line: index + 1,
          column: line.slice(0, matchIndex).length + 1,
          snippet: line.trim().slice(0, 240),
        });
        if (results.length >= maxResults) break;
      }
      if (results.length >= maxResults) break;
    }
    return results.sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line,
    );
  },

  async listTemplates(): Promise<TemplateInfo[]> {
    if (isTauriEnvironment()) {
      return tauriInvoke<TemplateInfo[]>("list_templates");
    }
    return [
      {
        id: "guionista-kit",
        name: "Guion Audiovisual (guionista-kit)",
        description: "Biblia, estructura, guion, investigación y agentes de guionista-kit.",
        source: "bundled",
      },
      {
        id: "blank",
        name: "Proyecto en blanco",
        description: "Carpeta limpia para escribir libremente.",
        source: "blank",
      },
    ];
  },

  async createProjectFromTemplate(
    templateId: string,
    name: string,
    destination: string,
  ): Promise<CreatedProject> {
    if (!isTauriEnvironment()) {
      throw new Error("La creación de proyectos requiere la app de escritorio");
    }
    return tauriInvoke<CreatedProject>("create_project_from_template", {
      templateId,
      name,
      destination,
    });
  },

  async saveCurrentAsTemplate(folderPath: string, name: string): Promise<TemplateInfo> {
    if (!isTauriEnvironment()) {
      throw new Error("Guardar plantillas requiere la app de escritorio");
    }
    return tauriInvoke<TemplateInfo>("save_current_as_template", {
      folderPath,
      name,
    });
  },

  async openTemplatesFolder(): Promise<void> {
    if (!isTauriEnvironment()) return;
    await tauriInvoke<void>("open_templates_folder");
  },
};

function isConfigSearchPath(path: string): boolean {
  return (
    path.startsWith(".opencode/") ||
    path.startsWith(".bradbit/") ||
    path.startsWith(".narra/") ||
    path === "AGENTS.md" ||
    path === "CLAUDE.md" ||
    path === ".gitignore" ||
    path.endsWith("/AGENTS.md") ||
    path.endsWith("/CLAUDE.md") ||
    path.endsWith("/.gitignore")
  );
}
