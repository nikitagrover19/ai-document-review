import { describe, expect, it } from 'vitest';
import type { Contract } from '../domain/types';
import type { LoadedReview } from '../services/reviewService';
import { computeProgress, computeRisk } from './progress';
import type { ReviewModel } from '../domain/types';
import { createReviewStore } from './reviewStore';

const contract: Contract = {
  id: 'doc-1',
  title: 'Test',
  sections: [{ id: 's', number: '1', heading: 'h', paragraphs: [{ id: 'p-1', number: '1.1', text: 'Hello brave new world.' }] }],
};
const finding = (id: string, severity: string) => ({
  id, severity, category: 'C', title: id, explanation: '', suggestedEdit: null, confidence: 0.5,
  anchor: { paragraphId: 'p-1', start: 0, end: 5, quote: 'Hello' },
});
const review: LoadedReview = { contract, file: { documentId: 'doc-1', findings: [finding('a', 'high'), finding('b', 'low')] } };

const ready = async () => {
  const store = createReviewStore(async () => review);
  await store.getState().load();
  return store;
};
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('loading', () => {
  it('goes idle -> loading -> ready and builds the model', async () => {
    const store = createReviewStore(async () => review);
    expect(store.getState().phase).toBe('idle');
    const pending = store.getState().load();
    expect(store.getState().phase).toBe('loading');
    await pending;
    expect(store.getState().phase).toBe('ready');
    expect(store.getState().model?.findings).toHaveLength(2);
  });

  it('shows an error, then recovers on retry', async () => {
    let fail = true;
    const store = createReviewStore(async () => {
      if (fail) throw new Error('boom');
      return review;
    });
    await store.getState().load();
    expect(store.getState()).toMatchObject({ phase: 'error', error: 'boom' });
    fail = false;
    await store.getState().load();
    expect(store.getState()).toMatchObject({ phase: 'ready', error: null });
  });

  it('lets only the newest load update the screen', async () => {
    const slow = deferred<LoadedReview>();
    let calls = 0;
    const store = createReviewStore(() => (++calls === 1 ? slow.promise : Promise.resolve(review)));
    const first = store.getState().load();
    await store.getState().load(); // second, fast load finishes first
    slow.resolve({ contract, file: { findings: [] } }); // first, stale load finishes later
    await first;
    expect(store.getState().model?.findings).toHaveLength(2);
  });
});

describe('selection', () => {
  it('remembers who made the selection', async () => {
    const store = await ready();
    store.getState().select('a', 'document');
    expect(store.getState().selection).toEqual({ findingId: 'a', source: 'document' });
    store.getState().select(null);
    expect(store.getState().selection).toBeNull();
  });

  it('ignores ids that do not exist', async () => {
    const store = await ready();
    store.getState().select('nope');
    expect(store.getState().selection).toBeNull();
  });
});

describe('decisions and comments', () => {
  it('sets and clears a decision', async () => {
    const store = await ready();
    store.getState().decide('a', 'accepted');
    expect(store.getState().decisions).toEqual({ a: 'accepted' });
    store.getState().decide('a', 'dismissed');
    expect(store.getState().decisions).toEqual({ a: 'dismissed' });
    store.getState().decide('a', null);
    expect(store.getState().decisions).toEqual({});
  });

  it('ignores decisions and comments for unknown findings', async () => {
    const store = await ready();
    store.getState().decide('ghost', 'accepted');
    store.getState().addComment('ghost', 'hi');
    expect(store.getState().decisions).toEqual({});
    expect(store.getState().comments).toEqual({});
  });

  it('trims comments and ignores empty ones', async () => {
    const store = await ready();
    store.getState().addComment('a', '   ');
    store.getState().addComment('a', '  check with legal  ');
    store.getState().addComment('a', 'second');
    const list = store.getState().comments['a']!;
    expect(list.map((c) => c.text)).toEqual(['check with legal', 'second']);
    expect(new Set(list.map((c) => c.id)).size).toBe(2);
  });

  it('a comment does not count as a decision', async () => {
    const store = await ready();
    store.getState().addComment('a', 'note');
    const { model, decisions } = store.getState();
    expect(computeProgress(model, decisions).decided).toBe(0);
  });
});

describe('progress', () => {
  it('counts accepted, dismissed and pending, and ignores unknown ids', async () => {
    const store = await ready();
    store.getState().decide('a', 'accepted');
    const { model } = store.getState();
    expect(computeProgress(model, { a: 'accepted', b: 'dismissed', ghost: 'accepted' })).toEqual({
      total: 2, accepted: 1, dismissed: 1, pending: 0, decided: 2,
    });
    expect(computeProgress(null, {})).toEqual({ total: 0, accepted: 0, dismissed: 0, pending: 0, decided: 0 });
  });
});

describe('risk', () => {
  const model = (list: [string, string, number | null][]) =>
    ({ findings: list.map(([id, severity, confidence]) => ({ id, severity, confidence })) }) as unknown as ReviewModel;

  it('is 0 without findings and when everything is decided', () => {
    expect(computeRisk(null, {})).toBe(0);
    expect(computeRisk(model([['a', 'high', 1]]), { a: 'dismissed' })).toBe(0);
  });

  it('weights severity (3/2/1) by confidence, against an all-high worst case', () => {
    const m = model([['a', 'high', 1], ['b', 'medium', 0.5], ['c', 'low', null]]);
    // open: 3 + 1 + 1 = 5 of a worst case of 9
    expect(computeRisk(m, {})).toBe(56);
    expect(computeRisk(m, { a: 'accepted' })).toBe(22);
  });
});

describe('filters', () => {
  it('merges changes and clears', async () => {
    const store = await ready();
    store.getState().setFilters({ severities: ['high'] });
    store.getState().setFilters({ statuses: ['pending'] });
    expect(store.getState().filters).toEqual({ severities: ['high'], categories: [], statuses: ['pending'] });
    store.getState().clearFilters();
    expect(store.getState().filters).toEqual({ severities: [], categories: [], statuses: [] });
  });
});
