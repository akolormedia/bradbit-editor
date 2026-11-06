export interface SessionTabInfo {
  id: string;
  title: string;
  streaming: boolean;
  error: boolean;
}

export function removeSessionTab(
  openIds: string[],
  activeId: string | null,
  removingId: string,
): { openIds: string[]; activeId: string | null } {
  const index = openIds.indexOf(removingId);
  if (index === -1) return { openIds, activeId };
  const next = openIds.filter((id) => id !== removingId);
  if (activeId !== removingId) {
    return { openIds: next, activeId };
  }
  if (next.length === 0) {
    return { openIds: next, activeId: null };
  }
  return {
    openIds: next,
    activeId: next[Math.min(index, next.length - 1)],
  };
}

export function addSessionTab(openIds: string[], id: string): string[] {
  return openIds.includes(id) ? openIds : [...openIds, id];
}
