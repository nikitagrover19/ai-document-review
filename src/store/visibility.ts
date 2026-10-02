import { compareForNavigation } from '../domain/model';
import { matchesFilters } from '../domain/filters';
import type { Decision, Filters, NavOrder, ReviewModel } from '../domain/types';

export interface VisibilityInput {
  model: ReviewModel | null;
  decisions: Record<string, Decision>;
  filters: Filters;
  selection: { findingId: string } | null;
  navOrder: NavOrder;
}

/**
 * Is this finding shown right now?
 * The SELECTED finding always stays visible, even if it no longer matches the filters.
 * Otherwise accepting a finding while the "Pending" filter is on would make it vanish
 * together with its Undo button.
 */
export function isVisible(state: VisibilityInput, findingId: string): boolean {
  const finding = state.model?.byId.get(findingId);
  if (!finding) return false;
  if (state.selection?.findingId === findingId) return true;
  return matchesFilters(finding, state.decisions[findingId] ?? 'pending', state.filters);
}

/** Visible findings in the order "Next" walks through (see compareForNavigation). */
export function visibleFindingIds(state: VisibilityInput): string[] {
  return (state.model?.findings ?? [])
    .filter((f) => isVisible(state, f.id))
    .sort(compareForNavigation(state.navOrder))
    .map((f) => f.id);
}
