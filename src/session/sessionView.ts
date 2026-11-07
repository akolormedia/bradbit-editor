export type SessionView = "chat" | "terminal";

export function toggleSessionView(view: SessionView): SessionView {
  return view === "chat" ? "terminal" : "chat";
}
