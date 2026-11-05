export interface WrapChange {
  from: number;
  to: number;
  insert: string;
}

export interface WrapEdit {
  changes: WrapChange[];
  selection: { anchor: number; head: number };
}

/**
 * Computes the transaction needed to toggle a symmetric Markdown marker
 * (for example `**` for bold or `*` for italic) around the current selection.
 * The function is pure so the behavior can be tested without a CodeMirror view.
 */
export function computeWrapEdit(
  text: string,
  from: number,
  to: number,
  marker: string,
): WrapEdit {
  const selected = text.slice(from, to);
  const before = text.slice(Math.max(0, from - marker.length), from);
  const after = text.slice(to, Math.min(text.length, to + marker.length));

  if (
    selected.length >= marker.length * 2 &&
    selected.startsWith(marker) &&
    selected.endsWith(marker)
  ) {
    const insert = selected.slice(marker.length, selected.length - marker.length);
    return {
      changes: [{ from, to, insert }],
      selection: { anchor: from, head: from + insert.length },
    };
  }

  if (before === marker && after === marker) {
    return {
      changes: [
        { from: from - marker.length, to: from, insert: "" },
        { from: to, to: to + marker.length, insert: "" },
      ],
      selection: {
        anchor: from - marker.length,
        head: to - marker.length,
      },
    };
  }

  const insert = `${marker}${selected}${marker}`;
  return {
    changes: [{ from, to, insert }],
    selection: {
      anchor: from + marker.length,
      head: to + marker.length,
    },
  };
}
