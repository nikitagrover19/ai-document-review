import type { Decision, Filters, ReviewStatus, Severity } from './types';

export const NO_FILTERS: Filters = { severities: [], categories: [], statuses: [] };

export const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low'];
export const STATUSES: readonly ReviewStatus[] = ['pending', 'accepted', 'dismissed'];

/** Inside one group: OR (high OR medium). Between groups: AND. An empty group allows everything. */
export function matchesFilters(
  finding: { severity: Severity; category: string },
  status: ReviewStatus,
  filters: Filters,
): boolean {
  return (
    (filters.severities.length === 0 || filters.severities.includes(finding.severity)) &&
    (filters.categories.length === 0 || filters.categories.includes(finding.category)) &&
    (filters.statuses.length === 0 || filters.statuses.includes(status))
  );
}

export function hasActiveFilters(filters: Filters): boolean {
  return filters.severities.length + filters.categories.length + filters.statuses.length > 0;
}

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

export interface Summary {
  total: number;
  bySeverity: Record<Severity, number>;
  byStatus: Record<ReviewStatus, number>;
  /** Biggest first, then A-Z. */
  byCategory: { category: string; count: number }[];
}

/** The numbers behind "how risky is this document". Counts everything, ignoring filters. */
export function summarize(
  findings: { id: string; severity: Severity; category: string }[],
  decisions: Record<string, Decision>,
): Summary {
  const bySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  const byStatus: Record<ReviewStatus, number> = { pending: 0, accepted: 0, dismissed: 0 };
  const categories = new Map<string, number>();
  for (const f of findings) {
    bySeverity[f.severity]++;
    byStatus[decisions[f.id] ?? 'pending']++;
    categories.set(f.category, (categories.get(f.category) ?? 0) + 1);
  }
  const byCategory = [...categories]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
  return { total: findings.length, bySeverity, byStatus, byCategory };
}
