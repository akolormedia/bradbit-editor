import { describe, expect, it } from "vitest";
import { computeWorkspaceLayout } from "./layout";

describe("workspace layout (T-2.4.3)", () => {
  it("shows both surfaces with a resizer and the configured chat width", () => {
    expect(
      computeWorkspaceLayout({
        chatVisible: true,
        editorVisible: true,
        sessionWidth: 430,
      }),
    ).toEqual({
      chatVisible: true,
      editorVisible: true,
      showSessionResizer: true,
      sessionFull: false,
      sessionWidth: "430px",
    });
  });

  it("keeps only the editor when the chat is hidden", () => {
    expect(
      computeWorkspaceLayout({
        chatVisible: false,
        editorVisible: true,
        sessionWidth: 430,
      }),
    ).toEqual({
      chatVisible: false,
      editorVisible: true,
      showSessionResizer: false,
      sessionFull: false,
      sessionWidth: "430px",
    });
  });

  it("expands the chat to full width when the editor is hidden", () => {
    expect(
      computeWorkspaceLayout({
        chatVisible: true,
        editorVisible: false,
        sessionWidth: 430,
      }),
    ).toEqual({
      chatVisible: true,
      editorVisible: false,
      showSessionResizer: false,
      sessionFull: true,
      sessionWidth: "100%",
    });
  });

  it("restores the chat when both surfaces were hidden", () => {
    expect(
      computeWorkspaceLayout({
        chatVisible: false,
        editorVisible: false,
        sessionWidth: 430,
      }),
    ).toEqual({
      chatVisible: true,
      editorVisible: false,
      showSessionResizer: false,
      sessionFull: true,
      sessionWidth: "100%",
    });
  });
});
