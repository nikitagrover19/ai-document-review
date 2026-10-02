import { describe, expect, it } from 'vitest';
import { NO_FILTERS, hasActiveFilters, matchesFilters, summarize, toggle } from './filters';
import { stepPending, toPercent } from './navigation';

const high = { severity: 'high', category: 'Liability' } as const;
const low = { severity: 'low', category: 'Payment' } as const;

describe('matchesFilters', () => {
  it('lets everything through when no filter is set', () => {
    expect(matchesFilters(high, 'pending', NO_FILTERS)).toBe(true);
  });
  it('is OR inside one group', () => {
    const f = { ...NO_FILTERS, severities: ['high', 'medium'] as const };
    expect(matchesFilters(high, 'pending', { ...f, severities: [...f.severities] })).toBe(true);
    expect(matchesFilters(low, 'pending', { ...f, severities: [...f.severities] })).toBe(false);
  });
  it('is AND between groups', () => {
    const f = { severities: ['high' as const], categories: ['Payment'], statuses: [] };
    expect(matchesFilters(high, 'pending', f)).toBe(false); // high, but wrong category
    expect(matchesFilters({ severity: 'high', category: 'Payment' }, 'pending', f)).toBe(true);
  });
  it('filters by status', () => {
    const f = { ...NO_FILTERS, statuses: ['pending' as const] };
    expect(matchesFilters(high, 'pending', f)).toBe(true);
    expect(matchesFilters(high, 'accepted', f)).toBe(false);
  });
});

describe('helpers', () => {
  it('detects active filters', () => {
    expect(hasActiveFilters(NO_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...NO_FILTERS, categories: ['x'] })).toBe(true);
  });
  it('toggles an item in a list without changing the original', () => {
    const list = ['a'];
    expect(toggle(list, 'b')).toEqual(['a', 'b']);
    expect(toggle(list, 'a')).toEqual([]);
    expect(list).toEqual(['a']);
  });
  it('summarizes counts and sorts categories by size, then name', () => {
    const findings = [
      { id: '1', severity: 'high' as const, category: 'Liability' },
      { id: '2', severity: 'high' as const, category: 'Liability' },
      { id: '3', severity: 'low' as const, category: 'Payment' },
      { id: '4', severity: 'medium' as const, category: 'Assignment' },
    ];
    const s = summarize(findings, { '1': 'accepted', '3': 'dismissed', ghost: 'accepted' });
    expect(s.total).toBe(4);
    expect(s.bySeverity).toEqual({ high: 2, medium: 1, low: 1 });
    expect(s.byStatus).toEqual({ pending: 2, accepted: 1, dismissed: 1 });
    expect(s.byCategory.map((c) => c.category)).toEqual(['Liability', 'Assignment', 'Payment']);
  });
});

describe('stepPending', () => {
  const order = ['a', 'b', 'c', 'd'];
  const pending = (done: string[]) => (id: string) => !done.includes(id);

  it('starts at the first (or last) pending finding when nothing is selected', () => {
    expect(stepPending(order, pending([]), null, 1)).toBe('a');
    expect(stepPending(order, pending([]), null, -1)).toBe('d');
  });
  it('moves to the next pending one and skips decided ones', () => {
    expect(stepPending(order, pending(['b', 'c']), 'a', 1)).toBe('d');
    expect(stepPending(order, pending(['b', 'c']), 'd', -1)).toBe('a');
  });
  it('wraps around', () => {
    expect(stepPending(order, pending([]), 'd', 1)).toBe('a');
    expect(stepPending(order, pending([]), 'a', -1)).toBe('d');
  });
  it('works from a decided finding (the one just handled)', () => {
    expect(stepPending(order, pending(['b']), 'b', 1)).toBe('c');
  });
  it('returns nothing when there is nowhere to go', () => {
    expect(stepPending(order, pending(order), 'a', 1)).toBeUndefined();
    expect(stepPending(order, pending(['b', 'c', 'd']), 'a', 1)).toBeUndefined(); // only the current one is left
    expect(stepPending([], pending([]), null, 1)).toBeUndefined();
  });
});

describe('toPercent', () => {
  it('clamps and survives bad input', () => {
    expect(toPercent(50, 200)).toBe(25);
    expect(toPercent(-10, 200)).toBe(0);
    expect(toPercent(500, 200)).toBe(100);
    expect(toPercent(10, 0)).toBe(0);
    expect(toPercent(NaN, 100)).toBe(0);
  });
});
