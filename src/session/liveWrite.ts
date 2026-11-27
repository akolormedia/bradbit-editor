/**
 * Reveals a live write preview in roughly two seconds, regardless of the
 * chapter size. Deltas can arrive in one big chunk, so the editor still shows
 * the text growing instead of jumping straight to the final file.
 */
export function revealLiveWriteContent(
  target: string,
  revealed: string,
): string {
  if (!target.startsWith(revealed)) {
    return target.slice(0, Math.min(revealed.length, target.length));
  }
  if (revealed.length >= target.length) return target;
  const chunk = Math.max(4, Math.ceil(target.length / 120));
  return target.slice(0, Math.min(target.length, revealed.length + chunk));
}


/** Applies the edit tool's old/new text to the pre-edit file content. */
export function applyLiveEdit(
  original: string,
  oldString: string,
  newString: string,
  replaceAll: boolean,
): string {
  if (!oldString) return original;
  if (replaceAll) return original.split(oldString).join(newString);
  const index = original.indexOf(oldString);
  if (index < 0) return original;
  return (
    original.slice(0, index) + newString + original.slice(index + oldString.length)
  );
}


export interface LiveWritingHighlight {
  from: number;
  to: number;
}

/** Range of the preview that should look selected while the AI writes. */
export function liveWritingHighlight(
  mode: "write" | "edit",
  original: string,
  oldString: string,
  revealedLength: number,
  revealedNewStringLength: number,
): LiveWritingHighlight | null {
  if (mode === "write") {
    return revealedLength > 0 ? { from: 0, to: revealedLength } : null;
  }
  if (revealedNewStringLength <= 0) return null;
  const index = original.indexOf(oldString);
  if (index < 0) return null;
  return { from: index, to: index + revealedNewStringLength };
}
