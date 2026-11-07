/**
 * Computes a panel width from a pointer drag.
 *
 * The drag is relative to where it started, not to the viewport origin. This
 * matters when the panel (the file tree) starts after another column such as
 * the chat, because using `clientX` as the width would make it jump.
 */
export function widthFromPointerDrag(
  startWidth: number,
  startX: number,
  pointerX: number,
  minWidth: number,
  maxWidth: number,
): number {
  const nextWidth = startWidth + (pointerX - startX);
  return Math.min(maxWidth, Math.max(minWidth, nextWidth));
}
