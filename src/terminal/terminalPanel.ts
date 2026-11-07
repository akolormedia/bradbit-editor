import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { backend } from "../backend";
import { t } from "../i18n";
import { Language } from "../types";
import { createIconButton } from "../ui/iconButton";

export interface TerminalPanelOptions {
  language: Language;
  projectName: string;
  rootPath: string;
  command: string;
  fontSize: number;
  onCommandChange: (command: string) => void;
}

const PRESETS = ["shell", "opencode", "claude"] as const;

function isPreset(command: string): boolean {
  return (PRESETS as readonly string[]).includes(command);
}

/**
 * Integrated PTY terminal. It keeps one xterm instance and one native session
 * for the open project and can be detached/re-attached when the user switches
 * between Chat and Terminal without losing the buffer.
 */
export class TerminalPanel {
  public readonly element: HTMLElement;
  private options: TerminalPanelOptions;
  private terminal: Terminal | null = null;
  private fitAddon = new FitAddon();
  private host: HTMLElement;
  private titleEl: HTMLElement;
  private commandSelect: HTMLSelectElement;
  private customWrap: HTMLElement;
  private customInput: HTMLInputElement;
  private restartBtn: HTMLButtonElement;
  private clearBtn: HTMLButtonElement;
  private sessionId: string | null = null;
  private startedSignature = "";
  private starting = false;
  private disposed = false;
  private opened = false;
  private unlistenOutput: (() => void) | null = null;
  private unlistenExit: (() => void) | null = null;
  private resizeObserver: ResizeObserver | null = null;

  constructor(options: TerminalPanelOptions) {
    this.options = options;
    this.element = document.createElement("section");
    this.element.className = "terminal-panel";
    this.element.dataset.testid = "terminal-panel";

    const header = document.createElement("div");
    header.className = "terminal-header";
    this.titleEl = document.createElement("span");
    this.titleEl.className = "terminal-title";

    this.commandSelect = document.createElement("select");
    this.commandSelect.className = "terminal-command-select";
    this.commandSelect.dataset.testid = "terminal-command";
    for (const value of PRESETS) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = this.commandLabel(value);
      this.commandSelect.appendChild(option);
    }
    const custom = document.createElement("option");
    custom.value = "custom";
    custom.textContent = t(options.language, "terminalCommandCustom");
    this.commandSelect.appendChild(custom);
    this.commandSelect.onchange = () => {
      const value = this.commandSelect.value;
      if (value === "custom") {
        this.syncCommandControls();
        this.customInput.focus();
        return;
      }
      this.options.onCommandChange(value);
    };

    this.customWrap = document.createElement("div");
    this.customWrap.className = "terminal-custom-command";
    this.customInput = document.createElement("input");
    this.customInput.className = "terminal-custom-input";
    this.customInput.dataset.testid = "terminal-custom-command";
    this.customInput.placeholder = t(
      options.language,
      "terminalCustomPlaceholder",
    );
    this.customInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const value = this.customInput.value.trim();
        if (value) this.options.onCommandChange(value);
      }
    };
    this.customWrap.appendChild(this.customInput);

    this.restartBtn = createIconButton({
      icon: "refresh-cw",
      label: t(options.language, "terminalRestart"),
      className: "terminal-action",
      testId: "terminal-restart",
      onClick: () => void this.restart(),
    });

    this.clearBtn = createIconButton({
      icon: "eraser",
      label: t(options.language, "terminalClear"),
      className: "terminal-action",
      testId: "terminal-clear",
      onClick: () => this.terminal?.clear(),
    });

    header.append(
      this.titleEl,
      this.commandSelect,
      this.customWrap,
      this.restartBtn,
      this.clearBtn,
    );

    this.host = document.createElement("div");
    this.host.className = "terminal-host";
    this.element.append(header, this.host);

    this.syncLabels();
    this.syncCommandControls();
    this.createTerminal();
    void this.setupListeners();
  }

  public update(options: Partial<TerminalPanelOptions>): void {
    const previousRoot = this.options.rootPath;
    const previousCommand = this.options.command;
    this.options = { ...this.options, ...options };
    this.syncLabels();
    this.syncCommandControls();
    if (this.terminal) {
      this.terminal.options.fontSize = this.options.fontSize;
      this.terminal.options.theme = this.theme();
    }
    const signature = `${this.options.rootPath}\0${this.options.command}`;
    if (
      !this.disposed &&
      (this.options.rootPath !== previousRoot ||
        this.options.command !== previousCommand) &&
      signature !== this.startedSignature
    ) {
      void this.restart();
    }
  }

  public focus(): void {
    requestAnimationFrame(() => {
      this.openTerminal();
      this.fit();
      this.terminal?.focus();
    });
  }

  public dispose(): void {
    this.disposed = true;
    this.unlistenOutput?.();
    this.unlistenOutput = null;
    this.unlistenExit?.();
    this.unlistenExit = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.terminal?.dispose();
    this.terminal = null;
    this.sessionId = null;
    void backend.ptyStop().catch(() => {});
  }

  private createTerminal(): void {
    this.terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"JetBrains Mono", "SF Mono", Menlo, monospace',
      fontSize: this.options.fontSize,
      scrollback: 5000,
      theme: this.theme(),
    });
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.onData((data) => {
      if (!this.sessionId) return;
      void backend.ptyWrite(this.sessionId, data).catch((error) => {
        this.writeError(error);
      });
    });
    this.terminal.onResize(({ cols, rows }) => {
      if (!this.sessionId) return;
      void backend
        .ptyResize(this.sessionId, cols, rows)
        .catch(() => {});
    });
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(this.host);
    requestAnimationFrame(() => this.fit());
  }

  private async setupListeners(): Promise<void> {
    const output = await backend.listenPtyOutput((event) => {
      if (event.id === this.sessionId) {
        this.terminal?.write(event.data);
      }
    });
    if (this.disposed) {
      output();
      return;
    }
    this.unlistenOutput = output;
    const exit = await backend.listenPtyExit((event) => {
      if (event.id !== this.sessionId) return;
      this.sessionId = null;
      const code = event.code == null ? "?" : String(event.code);
      this.terminal?.writeln(
        `\r\n\x1b[90m${t(this.options.language, "terminalExited", {
          code,
        })}\x1b[0m`,
      );
    });
    if (this.disposed) {
      exit();
      return;
    }
    this.unlistenExit = exit;
    await this.start();
  }

  private async start(): Promise<void> {
    if (this.disposed || this.starting || !this.options.rootPath) return;
    this.starting = true;
    this.terminal?.reset();
    this.terminal?.clear();
    try {
      await backend.ptyStop();
      const result = await backend.ptyStart(
        this.options.rootPath,
        this.options.command,
        this.terminal?.cols ?? 80,
        this.terminal?.rows ?? 24,
      );
      if (this.disposed) {
        await backend.ptyStop();
        return;
      }
      this.sessionId = result.id;
      this.startedSignature = `${this.options.rootPath}\0${this.options.command}`;
      if (this.options.command === "shell" || !isPreset(this.options.command)) {
        await backend.ptyWrite(result.id, "\r").catch(() => {});
      }
      this.focus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.terminal?.writeln(
        `\x1b[31m${t(this.options.language, "terminalStartError", {
          message,
        })}\x1b[0m`,
      );
    } finally {
      this.starting = false;
    }
  }

  private async restart(): Promise<void> {
    if (this.starting) return;
    this.sessionId = null;
    this.startedSignature = "";
    await this.start();
  }

  private openTerminal(): void {
    if (this.disposed || this.opened || !this.terminal || !this.host.isConnected) {
      return;
    }
    this.terminal.open(this.host);
    this.opened = true;
  }

  private fit(): void {
    if (!this.terminal || !this.host.isConnected) return;
    this.openTerminal();
    if (!this.opened) return;
    try {
      this.fitAddon.fit();
    } catch {
      return;
    }
    if (this.sessionId) {
      void backend
        .ptyResize(this.sessionId, this.terminal.cols, this.terminal.rows)
        .catch(() => {});
    }
  }

  private writeError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.terminal?.writeln(`\r\n\x1b[31m${message}\x1b[0m`);
  }

  private commandLabel(value: string): string {
    switch (value) {
      case "shell":
        return t(this.options.language, "terminalCommandShell");
      case "opencode":
        return t(this.options.language, "terminalCommandOpenCode");
      case "claude":
        return t(this.options.language, "terminalCommandClaude");
      default:
        return value;
    }
  }

  private syncLabels(): void {
    this.titleEl.textContent = t(
      this.options.language,
      "terminalTitle",
    );
    this.titleEl.title = this.options.projectName;
    this.commandSelect.options[0].textContent = this.commandLabel("shell");
    this.commandSelect.options[1].textContent = this.commandLabel("opencode");
    this.commandSelect.options[2].textContent = this.commandLabel("claude");
    this.commandSelect.options[3].textContent = t(
      this.options.language,
      "terminalCommandCustom",
    );
    this.customInput.placeholder = t(
      this.options.language,
      "terminalCustomPlaceholder",
    );
    this.restartBtn.title = t(this.options.language, "terminalRestart");
    this.restartBtn.setAttribute(
      "aria-label",
      t(this.options.language, "terminalRestart"),
    );
    this.clearBtn.title = t(this.options.language, "terminalClear");
    this.clearBtn.setAttribute(
      "aria-label",
      t(this.options.language, "terminalClear"),
    );
  }

  private syncCommandControls(): void {
    const preset = isPreset(this.options.command);
    this.commandSelect.value = preset ? this.options.command : "custom";
    this.customWrap.hidden = preset;
    this.customInput.value = preset ? "" : this.options.command;
  }

  private theme(): {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
  } {
    const light =
      document.documentElement.getAttribute("data-theme") === "light";
    return light
      ? {
          background: "#ffffff",
          foreground: "#1f2430",
          cursor: "#3b6fd8",
          selectionBackground: "#cfe0ff",
        }
      : {
          background: "#0f1115",
          foreground: "#d8dee9",
          cursor: "#7aa2f7",
          selectionBackground: "#33415c",
        };
  }
}
