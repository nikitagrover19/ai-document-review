import { describe, expect, it } from 'vitest';
import { chooseFindingOnClick } from './selection';
import type { Finding } from './types';

const f = (id: string, severity: Finding['severity'], confidence: number): [string, Finding] => [
  id,
  { id, severity, confidence, category: 'c', title: id, explanation: '', anchor: null, suggestedEdit: null },
];
const byId = new Map([f('a', 'high', 0.9), f('b', 'high', 0.7), f('c', 'low', 0.99)]);

describe('chooseFindingOnClick', () => {
  it('picks the most important finding first', () => {
    expect(chooseFindingOnClick(['c', 'b', 'a'], null, byId)).toBe('a');
  });
  it('steps through overlapping findings and wraps around', () => {
    expect(chooseFindingOnClick(['a', 'b', 'c'], 'a', byId)).toBe('b');
    expect(chooseFindingOnClick(['a', 'b', 'c'], 'b', byId)).toBe('c');
    expect(chooseFindingOnClick(['a', 'b', 'c'], 'c', byId)).toBe('a');
  });
  it('starts from the top when the selected finding is not under the click', () => {
    expect(chooseFindingOnClick(['b', 'c'], 'a', byId)).toBe('b');
  });
  it('keeps a single finding selected', () => {
    expect(chooseFindingOnClick(['a'], 'a', byId)).toBe('a');
  });
  it('ignores unknown ids and returns nothing for an empty click', () => {
    expect(chooseFindingOnClick(['ghost'], null, byId)).toBeUndefined();
    expect(chooseFindingOnClick([], null, byId)).toBeUndefined();
  });
});
