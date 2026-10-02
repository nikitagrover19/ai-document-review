import { compareByPriority } from './model';
import type { Finding } from './types';

/**
 * A click lands on text covered by one or more findings. Which one is selected?
 *  - Nothing selected yet, or the selected one is not here: the most important finding
 *    (severity, then confidence).
 *  - The selected one IS here and others overlap it: move to the next one, and wrap around.
 *    So clicking an overlap again steps through every finding that covers it.
 */
export function chooseFindingOnClick(
  ids: string[],
  currentId: string | null,
  byId: Map<string, Finding>,
): string | undefined {
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((f): f is Finding => f !== undefined)
    .sort(compareByPriority)
    .map((f) => f.id);
  if (ordered.length === 0) return undefined;
  const at = currentId === null ? -1 : ordered.indexOf(currentId);
  return at === -1 ? ordered[0] : ordered[(at + 1) % ordered.length];
}
