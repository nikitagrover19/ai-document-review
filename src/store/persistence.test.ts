import { describe, expect, it } from 'vitest';
import { buildReviewModel } from '../domain/model';
import type { Contract } from '../domain/types';
import type { LoadedReview } from '../services/reviewService';
import { keyFor, parseSaved, storageKey, writeSaved, type StorageLike } from './persistence';
import { createReviewStore } from './reviewStore';

const contract: Contract = {
  id: 'doc-1',
  title: 'Test',
  sections: [{ id: 's', number: '1', heading: 'h', paragraphs: [{ id: 'p-1', number: '1.1', text: 'Hello brave new world.' }] }],
};
const finding = (id: string, severity = 'high') => ({
  id, severity, category: 'C', title: id, explanation: '', suggestedEdit: null, confidence: 0.5,
  anchor: { paragraphId: 'p-1', start: 0, end: 5, quote: 'Hello' },
});
const agent = { name: 'Agent', version: '1.0' };
const review = (findings = [finding('a'), finding('b', 'low')], v = '1.0'): LoadedReview => ({
  contract,
  file: { documentId: 'doc-1', agent: { ...agent, version: v }, findings },
});
const model = buildReviewModel(contract, review().file);

function fakeStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageLike & { data: Map<string, string> } = {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
  return storage;
}
const KEY = keyFor({ documentId: 'doc-1', agent }, 'doc-1');
const ready = async (storage: StorageLike | null, r = review()) => {
  const store = createReviewStore(async () => r, storage);
  await store.getState().load();
  return store;
};

describe('the storage key', () => {
  it('depends on the document and the agent version', () => {
    expect(storageKey('d', agent)).not.toBe(storageKey('d', { ...agent, version: '2.0' }));
    expect(storageKey('d', agent)).not.toBe(storageKey('e', agent));
  });
});

describe('reading saved data defensively', () => {
  const raw = (o: unknown) => JSON.stringify(o);
  it('ignores corrupt JSON, other shapes and other versions', () => {
    expect(parseSaved('{oops', model)).toBeNull();
    expect(parseSaved('"text"', model)).toBeNull();
    expect(parseSaved('[]', model)).toBeNull();
    expect(parseSaved(raw({ version: 2, decisions: { a: 'accepted' } }), model)).toBeNull();
    expect(parseSaved(null, model)).toBeNull();
  });
  it('drops findings that no longer exist, and values that are not decisions', () => {
    const saved = parseSaved(raw({ version: 1, decisions: { a: 'accepted', gone: 'accepted', b: 'maybe' } }), model);
    expect(saved?.decisions).toEqual({ a: 'accepted' });
  });
  it('keeps only well-formed comments', () => {
    const good = { id: 'c1', text: 'ok', createdAt: '2026-09-21T10:00:00Z' };
    const saved = parseSaved(
      raw({ version: 1, comments: { a: [good, { id: 'c2', text: '  ', createdAt: good.createdAt }, { id: 'c3', text: 'x', createdAt: 'nope' }, 7], gone: [good] } }),
      model,
    );
    expect(saved?.comments).toEqual({ a: [good] });
  });
  it('ignores a finishedAt that is not a date', () => {
    expect(parseSaved(raw({ version: 1, finishedAt: 'yesterday-ish' }), model)?.finishedAt).toBeNull();
  });
});

describe('writing', () => {
  it('removes the record when there is nothing to keep', () => {
    const s = fakeStorage({ [KEY]: 'old' });
    expect(writeSaved(s, KEY, { decisions: {}, comments: {}, finishedAt: null })).toBe(true);
    expect(s.data.has(KEY)).toBe(false);
  });
  it('reports failure instead of throwing', () => {
    const broken: StorageLike = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('quota'); } };
    expect(writeSaved(broken, KEY, { decisions: { a: 'accepted' }, comments: {}, finishedAt: null })).toBe(false);
    expect(writeSaved(null, KEY, { decisions: { a: 'accepted' }, comments: {}, finishedAt: null })).toBe(false);
  });
});

describe('the store saves and restores', () => {
  it('saves decisions and comments, and a new session picks them up', async () => {
    const storage = fakeStorage();
    const first = await ready(storage);
    first.getState().decide('a', 'accepted');
    first.getState().addComment('b', 'Check with legal');
    first.getState().finish();
    expect(first.getState().saveStatus).toBe('saved');

    const second = await ready(storage);
    expect(second.getState().decisions).toEqual({ a: 'accepted' });
    expect(second.getState().comments.b?.[0]?.text).toBe('Check with legal');
    expect(second.getState().finishedAt).not.toBeNull();
  });

  it('does not apply saved work to a different agent version', async () => {
    const storage = fakeStorage();
    (await ready(storage)).getState().decide('a', 'accepted');
    const other = await ready(storage, review(undefined, '2.0'));
    expect(other.getState().decisions).toEqual({});
  });

  it('changing a decision after finishing re-opens the review', async () => {
    const store = await ready(fakeStorage());
    store.getState().decide('a', 'accepted');
    store.getState().finish();
    expect(store.getState().finishedAt).not.toBeNull();
    store.getState().decide('a', 'dismissed');
    expect(store.getState().finishedAt).toBeNull();
  });

  it('reset clears the screen and the saved copy', async () => {
    const storage = fakeStorage();
    const store = await ready(storage);
    store.getState().decide('a', 'accepted');
    store.getState().addComment('a', 'note');
    expect(storage.data.has(KEY)).toBe(true);
    store.getState().reset();
    expect(store.getState().decisions).toEqual({});
    expect(store.getState().comments).toEqual({});
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('survives corrupt saved data', async () => {
    const store = await ready(fakeStorage({ [KEY]: '{{{' }));
    expect(store.getState().phase).toBe('ready');
    expect(store.getState().decisions).toEqual({});
  });

  it('works, and says so, when the browser cannot save', async () => {
    const store = await ready(null);
    expect(store.getState().saveStatus).toBe('unavailable');
    store.getState().decide('a', 'accepted');
    expect(store.getState().decisions).toEqual({ a: 'accepted' });
  });

  it('flags a failed write', async () => {
    const storage = fakeStorage();
    const store = await ready(storage);
    storage.setItem = () => { throw new Error('quota'); };
    store.getState().decide('a', 'accepted');
    expect(store.getState().saveStatus).toBe('unavailable');
  });

  it('an empty result (the ?empty=1 demo) never wipes a saved review', async () => {
    const storage = fakeStorage();
    (await ready(storage)).getState().decide('a', 'accepted');
    const before = storage.data.get(KEY);
    const empty = await ready(storage, review([]));
    empty.getState().reset();
    expect(storage.data.get(KEY)).toBe(before);
  });

  it('does not save screen-only state', async () => {
    const storage = fakeStorage();
    const store = await ready(storage);
    store.getState().select('a');
    store.getState().setDraft('a', 'half typed');
    store.getState().setFilters({ severities: ['high'] });
    expect(storage.data.size).toBe(0);
  });
});
