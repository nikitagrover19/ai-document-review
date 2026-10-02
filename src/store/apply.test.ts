import { describe, expect, it } from 'vitest';
import type { Contract } from '../domain/types';
import type { LoadedReview } from '../services/reviewService';
import { createReviewStore } from './reviewStore';
import type { StorageLike } from './persistence';

const TEXT = 'Vendor owns everything. Customer pays on time.';
const contract: Contract = {
  id: 'doc-1',
  title: 'T',
  sections: [{ id: 's', number: '1', heading: 'h', paragraphs: [{ id: 'p-1', number: '1.1', text: TEXT }] }],
};
const finding = (id: string, start: number, end: number, edit: string | null) => ({
  id, severity: 'high', category: 'C', title: `Finding ${id}`, explanation: '', suggestedEdit: edit, confidence: 0.9,
  anchor: { paragraphId: 'p-1', start, end, quote: TEXT.slice(start, end) },
});
const review = (): LoadedReview => ({
  contract,
  file: {
    documentId: 'doc-1',
    agent: { name: 'A', version: '1' },
    findings: [
      finding('a', 0, 22, 'Customer owns the deliverables'), // overlaps b
      finding('b', 10, 22, 'everything we make'),
      finding('c', 24, 45, 'Customer pays within 30 days.'), // separate words
      finding('d', 0, 6, null), // no suggested edit
    ],
  },
});
const fakeStorage = (): StorageLike & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};
const ready = async (storage: StorageLike | null = null) => {
  const store = createReviewStore(async () => review(), storage);
  await store.getState().load();
  return store;
};

describe('applying edits', () => {
  it('applies an edit, accepts the finding, and leaves the document alone', async () => {
    const store = await ready();
    const before = JSON.stringify(store.getState().contract);
    store.getState().applyEdit('a');
    expect(store.getState().applied).toEqual(['a']);
    expect(store.getState().decisions.a).toBe('accepted');
    expect(JSON.stringify(store.getState().contract)).toBe(before);
  });

  it('blocks a second edit that touches the same words', async () => {
    const store = await ready();
    store.getState().applyEdit('a');
    store.getState().applyEdit('b');
    expect(store.getState().applied).toEqual(['a']);
    expect(store.getState().decisions.b).toBeUndefined(); // a blocked apply must not accept it either
  });

  it('allows it again after the first edit is reverted', async () => {
    const store = await ready();
    store.getState().applyEdit('a');
    store.getState().revertEdit('a');
    expect(store.getState().applied).toEqual([]);
    expect(store.getState().decisions.a).toBe('accepted'); // revert takes back the edit, not the decision
    store.getState().applyEdit('b');
    expect(store.getState().applied).toEqual(['b']);
  });

  it('applies edits in different words independently', async () => {
    const store = await ready();
    store.getState().applyEdit('a');
    store.getState().applyEdit('c');
    expect(store.getState().applied).toEqual(['a', 'c']);
  });

  it('ignores findings that cannot be applied, unknown ids, and double apply', async () => {
    const store = await ready();
    store.getState().applyEdit('d'); // no suggestion
    store.getState().applyEdit('ghost');
    store.getState().applyEdit('c');
    store.getState().applyEdit('c');
    expect(store.getState().applied).toEqual(['c']);
  });

  it('dismissing or undoing a finding takes its edit out', async () => {
    const store = await ready();
    store.getState().applyEdit('a');
    store.getState().applyEdit('c');
    store.getState().decide('a', 'dismissed');
    expect(store.getState().applied).toEqual(['c']);
    store.getState().decide('c', null);
    expect(store.getState().applied).toEqual([]);
  });

  it('re-accepting an applied finding keeps its edit', async () => {
    const store = await ready();
    store.getState().applyEdit('a');
    store.getState().decide('a', 'accepted');
    expect(store.getState().applied).toEqual(['a']);
  });

  it('changing the draft re-opens a finished review, and so does a new comment', async () => {
    const store = await ready();
    store.getState().applyEdit('a');
    store.getState().finish();
    store.getState().revertEdit('a');
    expect(store.getState().finishedAt).toBeNull();
    store.getState().finish();
    expect(store.getState().finishedAt).not.toBeNull();
    store.getState().addComment('c', 'one more thing');
    expect(store.getState().finishedAt).toBeNull();
  });

  it('reset clears applied edits', async () => {
    const store = await ready();
    store.getState().applyEdit('c');
    store.getState().reset();
    expect(store.getState().applied).toEqual([]);
  });
});

describe('saving applied edits', () => {
  it('a new session gets the applied edits back', async () => {
    const storage = fakeStorage();
    (await ready(storage)).getState().applyEdit('c');
    const second = await ready(storage);
    expect(second.getState().applied).toEqual(['c']);
    expect(second.getState().decisions.c).toBe('accepted');
  });

  it('drops a saved edit whose finding is no longer accepted or no longer applicable', async () => {
    const storage = fakeStorage();
    const key = [...(await (async () => { const s = await ready(storage); s.getState().applyEdit('c'); return storage.data.keys(); })())][0]!;
    storage.data.set(key, JSON.stringify({ version: 1, decisions: { c: 'dismissed', d: 'accepted' }, comments: {}, applied: ['c', 'd', 'ghost'], finishedAt: null }));
    const store = await ready(storage);
    expect(store.getState().applied).toEqual([]);
  });

  it('an old save without `applied` still loads', async () => {
    const storage = fakeStorage();
    const key = [...(await (async () => { const s = await ready(storage); s.getState().decide('a', 'accepted'); return storage.data.keys(); })())][0]!;
    storage.data.set(key, JSON.stringify({ version: 1, decisions: { a: 'accepted' }, comments: {}, finishedAt: null }));
    const store = await ready(storage);
    expect(store.getState().decisions.a).toBe('accepted');
    expect(store.getState().applied).toEqual([]);
  });

  it('removes the saved record when the last applied edit is reverted and nothing else is saved', async () => {
    const storage = fakeStorage();
    const store = await ready(storage);
    store.getState().applyEdit('c');
    expect(storage.data.size).toBe(1);
    store.getState().decide('c', null);
    expect(storage.data.size).toBe(0);
  });
});
