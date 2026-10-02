/**
 * "Next unresolved": walk the list in order, skip anything already decided, wrap around.
 * The current finding is never returned, so pressing Next always moves somewhere
 * (or does nothing when there is nowhere to go).
 */
export function stepPending(
  orderedIds: string[],
  isPending: (id: string) => boolean,
  currentId: string | null,
  direction: 1 | -1,
): string | undefined {
  const n = orderedIds.length;
  if (n === 0) return undefined;
  const at = currentId === null ? -1 : orderedIds.indexOf(currentId);
  for (let step = 1; step <= n; step++) {
    const i = at === -1 ? (direction === 1 ? step - 1 : n - step) : (((at + direction * step) % n) + n) % n;
    const id = orderedIds[i]!;
    if (id !== currentId && isPending(id)) return id;
  }
  return undefined;
}

/** Position of something inside a document, as 0..100 percent. */
export function toPercent(offset: number, total: number): number {
  if (!(total > 0) || !Number.isFinite(offset)) return 0;
  return Math.min(100, Math.max(0, (offset / total) * 100));
}
