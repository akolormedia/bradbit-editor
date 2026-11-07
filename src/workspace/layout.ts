export interface WorkspaceLayoutInput {
  chatVisible: boolean;
  editorVisible: boolean;
  sessionWidth: number;
}

export interface WorkspaceLayout {
  chatVisible: boolean;
  editorVisible: boolean;
  showSessionResizer: boolean;
  sessionFull: boolean;
  sessionWidth: string;
}

/**
 * Normalizes the chat/editor split used by the workspace shell.
 *
 * The app always keeps at least one surface visible. When the editor is
 * hidden the chat surface expands to the full width; when both are hidden the
 * chat is restored.
 */
export function computeWorkspaceLayout(
  input: WorkspaceLayoutInput,
): WorkspaceLayout {
  const editorVisible = input.editorVisible;
  const chatVisible = input.chatVisible || !editorVisible;
  const sessionFull = !editorVisible;

  return {
    chatVisible,
    editorVisible,
    showSessionResizer: chatVisible && editorVisible,
    sessionFull,
    sessionWidth: editorVisible ? `${input.sessionWidth}px` : "100%",
  };
}
