import {
  AppSettings,
  ByokProviderStatus,
  CreatedProject,
  FileTreeNode,
  FsChangeEvent,
  GitBranch,
  GitCommit,
  GitCommitFile,
  GitDiscardResult,
  GitRemote,
  GitStatus,
  GitHubBranch,
  GitHubPullRequest,
  GitHubRepository,
  GitHubUser,
  KitCatalog,
  MenuCommand,
  MenuUiState,
  OpenCodeChatMessage,
  OpenCodeEvent,
  OpenCodeForm,
  OpenCodeModel,
  OpenCodePermission,
  OpenCodeSession,
  OpenCodeStatus,
  OpenedFolder,
  ProjectWorkspaceState,
  PtyExitEvent,
  PtyOutputEvent,
  PtyStartResult,
  PtyStatus,
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
    "bible",
    "bible/characters",
    "bible/world",
    "structure",
    "script",
    "research",
    "notes",
    ".bradbit",
    ".bradbit/agents",
    ".bradbit/commands",
  ]),
  files: {
    "README.md": `# guionista-kit\n\nBase project template for screenwriting with Bradbit.\n`,
    "AGENTS.md": `# Project instructions\n\nRead by Bradbit at startup. The bible is the source of truth for the story world.\n`,
    "bible/premise.md": `# Premise\n\n**Logline:** Una archivista descubre cintas inéditas que contradicen la historia oficial de su ciudad.\n\n**Theme:** La memoria frente al olvido impuesto.\n`,
    "bible/chronology.md": `# Chronology\n\n- **1998:** Desaparición del archivo municipal.\n- **Presente:** Elena encuentra la primera caja en el sótano.\n`,
    "bible/characters/_template.md": `# Character Name\n\n- **Age:** \n- **Conscious want:** \n- **Unconscious need:** \n`,
    "bible/world/_template.md": `# World Rules and Locations\n\nDescribe the main spaces of the story here.\n`,
    "structure/outline.md": `# Outline — Act I\n\n1. **INT. ARCHIVO MUNICIPAL - NOCHE:** Elena cataloga cajas húmedas antes del cierre.\n2. **EXT. CALLEJÓN CENTRAL - NOCHE:** Encuentro con el antiguo proyeccionista.\n`,
    "script/episode-1.fountain": `Title: EL ARCHIVO DEL SILENCIO\nCredit: Escrito por\nAuthor: Equipo Creativo\nDraft date: 2026\n\nINT. ARCHIVO MUNICIPAL - NOCHE\n\nUn sótano largo iluminado por tubos fluorescentes que parpadean. Cajas de cartón apiladas hasta el techo.\n\nELENA (34), manos manchadas de polvo, sostiene una bobina de 16mm contra la luz.\n\nELENA\n(en voz baja)\nEsto no estaba en el inventario.\n\nUn GOLPE SECO resuena al fondo del pasillo.\n\nCORTE A:\n`,
    ".bradbit/agents/screenwriter.md": `---\nname: Screenwriter\ndescription: Writes ideas, characters, structure, outlines and scene drafts.\n---\n\n# Agent: screenwriter\nActive writing role.\n`,
    ".bradbit/commands/scene.md": `---\nname: Scene\ndescription: "Writes the draft of a scene from the outline."\nagent: screenwriter\n---\nUse the write-scene skill.\n`,
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

  async pickSaveFileDialog(defaultPath: string): Promise<string | null> {
    if (!isTauriEnvironment()) return null;
    const { save } = await import("@tauri-apps/plugin-dialog");
    const selected = await save({
      defaultPath,
      filters: [
        { name: "Markdown", extensions: ["md", "mdx"] },
        { name: "Fountain", extensions: ["fountain"] },
        { name: "Texto", extensions: ["txt"] },
      ],
    });
    return typeof selected === "string" ? selected : null;
  },

  async discoverKit(rootPath: string): Promise<KitCatalog> {
    if (!isTauriEnvironment()) {
      return { agents: [], commands: [], skills: [] };
    }
    return tauriInvoke<KitCatalog>("discover_kit", { root: rootPath });
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
      throw new Error(`File not found: ${relPath}`);
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
      throw new Error("Invalid path");
    }
    if (isDir) {
      activeVirtualFs.dirs.add(clean);
    } else {
      if (clean in activeVirtualFs.files) {
        throw new Error(`File already exists: ${clean}`);
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
      throw new Error("Invalid path");
    }
    if (oldRelPath in activeVirtualFs.files) {
      if (cleanNew in activeVirtualFs.files) {
        throw new Error("A file with that name already exists");
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
      throw new Error("PDF export requires the desktop app");
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
        name: "Screenwriting (guionista-kit)",
        description: "Film, series and microdrama writing with a story bible.",
        source: "bundled",
      },
      {
        id: "campaign-kit",
        name: "Advertising campaigns (campaign-kit)",
        description: "Client folders, briefs, strategy, creative and approvals.",
        source: "bundled",
      },
      {
        id: "libro-kit",
        name: "Novel (libro-kit)",
        description:
          "Novel writing with bible, structure, manuscript, research, revision and pitch.",
        source: "bundled",
      },
      {
        id: "blank",
        name: "Blank project",
        description: "A clean folder to write freely.",
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
      throw new Error("Project creation requires the desktop app");
    }
    return tauriInvoke<CreatedProject>("create_project_from_template", {
      templateId,
      name,
      destination,
    });
  },

  async saveCurrentAsTemplate(folderPath: string, name: string): Promise<TemplateInfo> {
    if (!isTauriEnvironment()) {
      throw new Error("Saving templates requires the desktop app");
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

  async startWatching(rootPath: string): Promise<void> {
    if (!isTauriEnvironment()) return;
    await tauriInvoke<void>("start_watching", { root: rootPath });
  },

  async stopWatching(): Promise<void> {
    if (!isTauriEnvironment()) return;
    await tauriInvoke<void>("stop_watching");
  },

  async listenFsChanges(
    handler: (event: FsChangeEvent) => void,
  ): Promise<() => void> {
    if (!isTauriEnvironment()) {
      return () => {};
    }
    const { listen } = await import("@tauri-apps/api/event");
    return listen<FsChangeEvent>("bradbit-fs-change", (event) =>
      handler(event.payload),
    );
  },

  async gitStatus(rootPath: string): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      return { isRepository: false, branch: null, ahead: 0, behind: 0, entries: [] };
    }
    return tauriInvoke<GitStatus>("git_status", { root: rootPath });
  },

  async gitInit(rootPath: string): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_init", { root: rootPath });
  },

  async gitDiffFile(rootPath: string, relPath: string): Promise<string> {
    if (!isTauriEnvironment()) return "";
    return tauriInvoke<string>("git_diff_file", { root: rootPath, relPath });
  },

  async gitRestoreFile(rootPath: string, relPath: string): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_restore_file", { root: rootPath, relPath });
  },

  async gitHeadFile(rootPath: string, relPath: string): Promise<string | null> {
    if (!isTauriEnvironment()) return null;
    return tauriInvoke<string | null>("git_head_file", {
      root: rootPath,
      relPath,
    });
  },

  async gitDiscardFile(
    rootPath: string,
    relPath: string,
  ): Promise<GitDiscardResult> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitDiscardResult>("git_discard_file", {
      root: rootPath,
      relPath,
    });
  },

  async gitSaveVersion(
    rootPath: string,
    message: string,
    authorName: string,
    authorEmail: string,
  ): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_save_version", {
      root: rootPath,
      message,
      authorName,
      authorEmail,
    });
  },

  async gitHistory(rootPath: string, limit = 30): Promise<GitCommit[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<GitCommit[]>("git_history", { root: rootPath, limit });
  },

  async gitCommitFiles(
    rootPath: string,
    commitId: string,
  ): Promise<GitCommitFile[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<GitCommitFile[]>("git_commit_files", {
      root: rootPath,
      commitId,
    });
  },

  async gitRestoreFromCommit(
    rootPath: string,
    commitId: string,
    relPath: string,
  ): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_restore_from_commit", {
      root: rootPath,
      commitId,
      relPath,
    });
  },

  async gitBranches(rootPath: string): Promise<GitBranch[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<GitBranch[]>("git_branches", { root: rootPath });
  },

  async gitCreateBranch(rootPath: string, name: string): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_create_branch", { root: rootPath, name });
  },

  async gitCheckoutBranch(rootPath: string, name: string): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_checkout_branch", {
      root: rootPath,
      name,
    });
  },

  async gitRemotes(rootPath: string): Promise<GitRemote[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<GitRemote[]>("git_remotes", { root: rootPath });
  },

  async gitAddRemote(
    rootPath: string,
    name: string,
    url: string,
  ): Promise<GitRemote[]> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitRemote[]>("git_add_remote", {
      root: rootPath,
      name,
      url,
    });
  },

  async gitPush(
    rootPath: string,
    remote: string,
    branch: string,
  ): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_push", {
      root: rootPath,
      remote,
      branch,
    });
  },

  async gitPull(
    rootPath: string,
    remote: string,
    branch: string,
  ): Promise<GitStatus> {
    if (!isTauriEnvironment()) {
      throw new Error("Git requires the desktop app");
    }
    return tauriInvoke<GitStatus>("git_pull", {
      root: rootPath,
      remote,
      branch,
    });
  },

  async githubTokenStatus(): Promise<boolean> {
    if (!isTauriEnvironment()) return false;
    return tauriInvoke<boolean>("github_token_status");
  },

  async githubSetToken(token: string): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("GitHub requires the desktop app");
    }
    return tauriInvoke<void>("github_set_token", { token });
  },

  async githubClearToken(): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("GitHub requires the desktop app");
    }
    return tauriInvoke<void>("github_clear_token");
  },

  async githubVerifyAccount(): Promise<GitHubUser> {
    if (!isTauriEnvironment()) {
      throw new Error("GitHub requires the desktop app");
    }
    return tauriInvoke<GitHubUser>("github_verify_account");
  },

  async githubGetRepository(
    owner: string,
    repo: string,
  ): Promise<GitHubRepository> {
    if (!isTauriEnvironment()) {
      throw new Error("GitHub requires the desktop app");
    }
    return tauriInvoke<GitHubRepository>("github_get_repository", {
      owner,
      repo,
    });
  },

  async githubCreateRepository(
    name: string,
    isPrivate: boolean,
    description?: string,
  ): Promise<GitHubRepository> {
    if (!isTauriEnvironment()) {
      throw new Error("GitHub requires the desktop app");
    }
    return tauriInvoke<GitHubRepository>("github_create_repository", {
      name,
      isPrivate,
      description,
    });
  },

  async githubListBranches(
    owner: string,
    repo: string,
    maxPages = 1,
  ): Promise<GitHubBranch[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<GitHubBranch[]>("github_list_branches", {
      owner,
      repo,
      maxPages,
    });
  },

  async githubListPullRequests(
    owner: string,
    repo: string,
    prState = "open",
    maxPages = 1,
  ): Promise<GitHubPullRequest[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<GitHubPullRequest[]>("github_list_pull_requests", {
      owner,
      repo,
      prState,
      maxPages,
    });
  },

  async githubCreatePullRequest(
    owner: string,
    repo: string,
    title: string,
    head: string,
    base: string,
    body?: string,
  ): Promise<GitHubPullRequest> {
    if (!isTauriEnvironment()) {
      throw new Error("GitHub requires the desktop app");
    }
    return tauriInvoke<GitHubPullRequest>("github_create_pull_request", {
      owner,
      repo,
      title,
      head,
      base,
      body,
    });
  },

  async byokStatus(): Promise<ByokProviderStatus[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<ByokProviderStatus[]>("byok_status");
  },

  async byokSetKey(providerId: string, key: string): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("BYOK requires the desktop app");
    }
    return tauriInvoke<void>("byok_set_key", { providerId, key });
  },

  async byokDeleteKey(providerId: string): Promise<void> {
    if (!isTauriEnvironment()) return;
    return tauriInvoke<void>("byok_delete_key", { providerId });
  },

  async opencodeStart(rootPath: string): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_start", { root: rootPath });
  },

  async opencodeStop(): Promise<void> {
    if (!isTauriEnvironment()) return;
    return tauriInvoke<void>("opencode_stop");
  },

  async opencodeSend(sessionId: string, text: string): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_send", { sessionId, text });
  },

  async opencodeAbort(sessionId: string): Promise<boolean> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<boolean>("opencode_abort", { sessionId });
  },

  async opencodeListSessions(): Promise<OpenCodeSession[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<OpenCodeSession[]>("opencode_list_sessions");
  },

  async opencodeCreateSession(title: string): Promise<OpenCodeSession> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<OpenCodeSession>("opencode_create_session", { title });
  },

  async opencodeRenameSession(sessionId: string, title: string): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_update_session_title", {
      sessionId,
      title,
    });
  },

  async opencodeSessionMessages(
    sessionId: string,
  ): Promise<OpenCodeChatMessage[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<OpenCodeChatMessage[]>("opencode_session_messages", {
      sessionId,
    });
  },

  async opencodePendingPermissions(
    sessionId: string,
  ): Promise<OpenCodePermission[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<OpenCodePermission[]>("opencode_pending_permissions", {
      sessionId,
    });
  },

  async opencodeReplyPermission(
    sessionId: string,
    requestId: string,
    decision: "once" | "always" | "reject",
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_reply_permission", {
      sessionId,
      requestId,
      decision,
    });
  },

  async opencodeListModels(): Promise<OpenCodeModel[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<OpenCodeModel[]>("opencode_list_models");
  },

  async opencodeSwitchAgent(sessionId: string, agent: string): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_switch_agent", { sessionId, agent });
  },

  async opencodeSwitchModel(
    sessionId: string,
    providerId: string,
    modelId: string,
    variant?: string,
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_switch_model", {
      sessionId,
      providerId,
      modelId,
      variant: variant ?? null,
    });
  },

  async opencodeRunCommand(
    sessionId: string,
    name: string,
    text: string,
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_run_command", {
      sessionId,
      name,
      text,
    });
  },

  async opencodePendingForms(sessionId: string): Promise<OpenCodeForm[]> {
    if (!isTauriEnvironment()) return [];
    return tauriInvoke<OpenCodeForm[]>("opencode_pending_forms", {
      sessionId,
    });
  },

  async opencodeReplyForm(
    sessionId: string,
    formId: string,
    answer: Record<string, unknown>,
  ): Promise<void> {
    if (!isTauriEnvironment()) {
      throw new Error("OpenCode requires the desktop app");
    }
    return tauriInvoke<void>("opencode_reply_form", {
      sessionId,
      formId,
      answer,
    });
  },

  async opencodeStatus(): Promise<OpenCodeStatus> {
    if (!isTauriEnvironment()) {
      return {
        binaryFound: false,
        running: false,
        sessionId: null,
        root: null,
      };
    }
    return tauriInvoke<OpenCodeStatus>("opencode_status");
  },

  async ptyStart(
    rootPath: string,
    command: string,
    cols: number,
    rows: number,
  ): Promise<PtyStartResult> {
    if (!isTauriEnvironment()) {
      throw new Error("The terminal requires the desktop app");
    }
    return tauriInvoke<PtyStartResult>("pty_start", {
      root: rootPath,
      command,
      cols,
      rows,
    });
  },

  async ptyWrite(id: string, data: string): Promise<void> {
    if (!isTauriEnvironment()) return;
    return tauriInvoke<void>("pty_write", { id, data });
  },

  async ptyResize(id: string, cols: number, rows: number): Promise<void> {
    if (!isTauriEnvironment()) return;
    return tauriInvoke<void>("pty_resize", { id, cols, rows });
  },

  async ptyStop(): Promise<void> {
    if (!isTauriEnvironment()) return;
    return tauriInvoke<void>("pty_stop");
  },

  async ptyStatus(): Promise<PtyStatus> {
    if (!isTauriEnvironment()) {
      return {
        running: false,
        id: null,
        root: null,
        command: null,
      };
    }
    return tauriInvoke<PtyStatus>("pty_status");
  },

  async listenPtyOutput(
    handler: (event: PtyOutputEvent) => void,
  ): Promise<() => void> {
    if (!isTauriEnvironment()) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<PtyOutputEvent>("bradbit-pty-output", (event) =>
      handler(event.payload),
    );
  },

  async listenPtyExit(
    handler: (event: PtyExitEvent) => void,
  ): Promise<() => void> {
    if (!isTauriEnvironment()) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    return listen<PtyExitEvent>("bradbit-pty-exit", (event) =>
      handler(event.payload),
    );
  },

  async listenOpenCodeEvents(
    handler: (event: OpenCodeEvent) => void,
  ): Promise<() => void> {
    if (!isTauriEnvironment()) {
      return () => {};
    }
    const { listen } = await import("@tauri-apps/api/event");
    return listen<OpenCodeEvent>("bradbit-opencode-event", (event) =>
      handler(event.payload),
    );
  },

  async loadWorkspaceState(rootPath: string): Promise<ProjectWorkspaceState> {
    if (!isTauriEnvironment()) {
      return {
        openSessionIds: [],
        activeSessionId: null,
        layout: {
          sessionWidth: 430,
          chatVisible: true,
          editorVisible: true,
        },
      };
    }
    return tauriInvoke<ProjectWorkspaceState>("load_workspace_state", {
      root: rootPath,
    });
  },

  async saveWorkspaceState(
    rootPath: string,
    state: ProjectWorkspaceState,
  ): Promise<void> {
    if (!isTauriEnvironment()) return;
    return tauriInvoke<void>("save_workspace_state", {
      root: rootPath,
      state,
    });
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
