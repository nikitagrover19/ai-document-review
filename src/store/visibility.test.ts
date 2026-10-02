import { beforeEach, describe, expect, it } from 'vitest';
import { reviewStore } from './reviewStore';
import { isVisible, visibleFindingIds } from './visibility';
import { loadFixture } from '../test/fixtures';

const state = () => reviewStore.getState();
beforeEach(loadFixture);

describe('what is visible', () => {
  it('shows everything: High, then Medium, then Low; top to bottom inside each', () => {
    // whole-document findings come first in reading order: f-09, f-77, f-78; then p-6.2 (f-04, f-05); then p-9.2 (f-99, f-08)
    expect(visibleFindingIds(state())).toEqual(['f-09', 'f-04', 'f-05', 'f-08', 'f-77', 'f-78', 'f-99']);
  });

  it('follows plain reading order when asked', () => {
    state().setNavOrder('document');
    expect(visibleFindingIds(state())).toEqual(['f-09', 'f-77', 'f-78', 'f-04', 'f-05', 'f-99', 'f-08']);
  });

  it('applies filters', () => {
    state().setFilters({ severities: ['low'] });
    expect(visibleFindingIds(state())).toEqual(['f-77', 'f-78', 'f-99']);
    state().setFilters({ categories: ['Governance'] });
    expect(visibleFindingIds(state())).toEqual(['f-77']);
  });

  it('keeps the selected finding visible even when it no longer matches', () => {
    state().setFilters({ statuses: ['pending'] });
    state().select('f-04', 'card');
    state().decide('f-04', 'accepted');
    expect(isVisible(state(), 'f-04')).toBe(true);
    state().select(null);
    expect(isVisible(state(), 'f-04')).toBe(false);
  });

  it('treats unknown ids as not visible', () => {
    expect(isVisible(state(), 'ghost')).toBe(false);
  });
});

describe('stepping through findings', () => {
  it('goes to the most important pending finding first and marks the selection as navigation', () => {
    state().step(1);
    expect(state().selection).toEqual({ findingId: 'f-09', source: 'nav' });
    state().step(1);
    expect(state().selection?.findingId).toBe('f-04');
  });

  it('skips findings that are already decided', () => {
    state().decide('f-05', 'dismissed');
    state().select('f-04', 'card');
    state().step(1);
    expect(state().selection?.findingId).toBe('f-08');
  });

  it('goes backwards and wraps', () => {
    state().step(-1);
    expect(state().selection?.findingId).toBe('f-99');
  });

  it('only walks through what the filters show', () => {
    state().setFilters({ severities: ['high'] });
    state().step(1);
    state().step(1);
    state().step(1);
    state().step(1);
    expect(state().selection?.findingId).toBe('f-09'); // f-09, f-04, f-05, then back to f-09
  });

  it('does nothing when everything visible is decided', () => {
    for (const id of ['f-04', 'f-09', 'f-05', 'f-08', 'f-99', 'f-77', 'f-78']) state().decide(id, 'accepted');
    state().step(1);
    expect(state().selection).toBeNull();
  });
});
