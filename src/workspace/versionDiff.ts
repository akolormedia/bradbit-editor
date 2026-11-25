export type VersionDiffLineKind = "context" | "added" | "removed" | "meta";

export interface VersionDiffLine {
  kind: VersionDiffLineKind;
  oldLine: number | null;
  newLine: number | null;
  text: string;
}

export interface VersionDiffHunk {
  header: string;
  lines: VersionDiffLine[];
}

export interface ParsedVersionDiff {
  hunks: VersionDiffHunk[];
  binary: boolean;
  empty: boolean;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/**
 * Parse the unified patch produced by `git_diff_file` into rows for the
 * versioning accordions. Only the hunk body is kept: `diff --git`, `index`,
 * `---` and `+++` headers add noise inside a compact inline diff.
 */
export function parseVersionDiff(patch: string): ParsedVersionDiff {
  if (!patch.trim()) {
    return { hunks: [], binary: false, empty: true };
  }

  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const binary = lines.some((line) => line.startsWith("Binary files "));
  const hunks: VersionDiffHunk[] = [];
  let hunk: VersionDiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of lines) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      hunk = {
        header: raw,
        lines: [],
      };
      hunks.push(hunk);
      continue;
    }

    if (!hunk) continue;

    if (raw.startsWith("\\")) {
      hunk.lines.push({
        kind: "meta",
        oldLine: null,
        newLine: null,
        text: raw.slice(1).trim(),
      });
      continue;
    }

    if (raw.startsWith("+")) {
      hunk.lines.push({
        kind: "added",
        oldLine: null,
        newLine,
        text: raw.slice(1),
      });
      newLine += 1;
      continue;
    }

    if (raw.startsWith("-")) {
      hunk.lines.push({
        kind: "removed",
        oldLine,
        newLine: null,
        text: raw.slice(1),
      });
      oldLine += 1;
      continue;
    }

    if (raw.startsWith(" ")) {
      hunk.lines.push({
        kind: "context",
        oldLine,
        newLine,
        text: raw.slice(1),
      });
      oldLine += 1;
      newLine += 1;
      continue;
    }

    if (raw === "") {
      // A final newline in the patch leaves one empty split entry; it is not
      // a context line.
      continue;
    }

    // A second file header ends the current file patch.
    if (raw.startsWith("diff --git ")) {
      hunk = null;
    }
  }

  return {
    hunks,
    binary,
    empty: hunks.length === 0 && !binary,
  };
}

/** Build a patch for a brand-new text file so it renders as additions. */
export function newFilePatch(path: string, content: string): string {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const body = lines.map((line) => `+${line}`).join("\n");
  const count = lines.length;
  return [
    `diff --git a/${path} b/${path}`,
    "new file",
    `--- /dev/null`,
    `+++ b/${path}`,
    `@@ -0,0 +1,${count} @@`,
    body,
  ].join("\n");
}
