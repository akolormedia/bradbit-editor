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
