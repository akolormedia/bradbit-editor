import {
  classifyFountainLine,
  createFountainState,
  FountainLineType,
} from "./fountain";

export interface FountainPreviewLine {
  type: FountainLineType;
  text: string;
}

export interface FountainPreviewPage {
  lines: FountainPreviewLine[];
}

const MAX_PAGE_LINES = 55;
const DIALOGUE_CHARS_PER_LINE = 32;
const ACTION_CHARS_PER_LINE = 58;

export function classifyFountainLines(source: string): FountainPreviewLine[] {
  let state = createFountainState();
  return source.split(/\r?\n/).map((raw) => {
    const classified = classifyFountainLine(raw, state);
    state = classified.state;
    const text =
      classified.type === "section"
        ? raw.replace(/^#+\s*/, "").trimEnd()
        : raw.trimEnd();
    return { type: classified.type, text };
  });
}

function visualLineCount(line: FountainPreviewLine): number {
  if (line.type === "blank") return 1;
  if (line.type === "dialogue") {
    return Math.max(
      1,
      Math.ceil(line.text.length / DIALOGUE_CHARS_PER_LINE),
    );
  }
  if (line.type === "action") {
    return Math.max(1, Math.ceil(line.text.length / ACTION_CHARS_PER_LINE));
  }
  return 1;
}

/** Splits a Fountain document into screenplay pages with a line budget. */
export function paginateFountain(
  source: string,
  maxLines = MAX_PAGE_LINES,
): FountainPreviewPage[] {
  const lines = classifyFountainLines(source);
  const pages: FountainPreviewPage[] = [];
  let current: FountainPreviewLine[] = [];
  let used = 0;

  for (const line of lines) {
    const needed = visualLineCount(line);
    if (current.length > 0 && used + needed > maxLines) {
      pages.push({ lines: current });
      current = [];
      used = 0;
    }
    current.push(line);
    used += needed;
  }
  if (current.length > 0) pages.push({ lines: current });
  return pages;
}

/** Renders a paginated, paper-style Fountain preview. */
export function renderFountainPreview(source: string): HTMLElement {
  const container = document.createElement("div");
  container.className = "fountain-preview";
  const pages = paginateFountain(source);

  pages.forEach((page, index) => {
    const pageEl = document.createElement("section");
    pageEl.className = "fountain-page";
    pageEl.dataset.page = String(index + 1);

    const number = document.createElement("div");
    number.className = "fountain-page-number";
    number.textContent = String(index + 1);

    const body = document.createElement("div");
    body.className = "fountain-page-body";
    for (const line of page.lines) {
      const lineEl = document.createElement("div");
      lineEl.className = `fountain-line fountain-${line.type}`;
      lineEl.textContent = line.text || "\u00a0";
      body.appendChild(lineEl);
    }

    pageEl.append(number, body);
    container.appendChild(pageEl);
  });

  return container;
}
