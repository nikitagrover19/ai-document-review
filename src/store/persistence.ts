import { sanitizeApplied } from '../domain/edits';
import type { Decision, FindingsFile, ReviewComment, ReviewModel } from '../domain/types';

/**
 * Saving the reviewer's work in the browser (localStorage).
 *
 * What is saved: decisions, comments, and whether the review was finished.
 * What is NOT saved: anything calculated (progress, filters, highlights) or purely on-screen
 * (selection, filters, half-typed comments).
 *
 * The key contains the document id AND the agent version. A new agent run can number or word
 * its findings differently, so an old "f-08 accepted" must never be applied to a new f-08.
 *
 * Saved data is never trusted: it is parsed defensively and anything that does not fit the
 * current findings is dropped.
 */

export const STORAGE_PREFIX = 'docreview:v1';

export interface SavedReview {
  version: 1;
  decisions: Record<string, Decision>;
  comments: Record<string, ReviewComment[]>;
  /** Finding ids whose suggested edit is applied, in the order they were applied. */
  applied: string[];
  finishedAt: string | null;
  savedAt: string;
}

/** The small part of the Storage interface we use (easy to fake in tests). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function storageKey(documentId: string, agent: { name: string; version: string } | undefined): string {
  const who = agent ? `${agent.name}@${agent.version}` : 'unknown-agent';
  return `${STORAGE_PREFIX}:${encodeURIComponent(documentId)}:${encodeURIComponent(who)}`;
}

/** localStorage can be missing or throw (private mode, blocked cookies). Never let that crash the app. */
export function browserStorage(): StorageLike | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = `${STORAGE_PREFIX}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** Turn stored text into a safe SavedReview for THIS model, or null if there is nothing usable. */
export function parseSaved(raw: string | null, model: ReviewModel): SavedReview | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObject(data) || data.version !== 1) return null;

  const decisions: Record<string, Decision> = {};
  if (isObject(data.decisions)) {
    for (const [id, value] of Object.entries(data.decisions)) {
      if (model.byId.has(id) && (value === 'accepted' || value === 'dismissed')) decisions[id] = value;
    }
  }

  const comments: Record<string, ReviewComment[]> = {};
  if (isObject(data.comments)) {
    for (const [id, list] of Object.entries(data.comments)) {
      if (!model.byId.has(id) || !Array.isArray(list)) continue;
      const clean: ReviewComment[] = [];
      for (const c of list) {
        if (!isObject(c) || typeof c.text !== 'string' || !c.text.trim() || typeof c.id !== 'string' || !isDate(c.createdAt)) continue;
        clean.push({ id: c.id, text: c.text, createdAt: c.createdAt });
      }
      if (clean.length > 0) comments[id] = clean;
    }
  }

  // Older saves have no `applied`. Applied edits are only kept when they still make sense for this model.
  const applied = sanitizeApplied(Array.isArray(data.applied) ? data.applied : [], model, decisions);

  return {
    version: 1,
    decisions,
    comments,
    applied,
    finishedAt: isDate(data.finishedAt) ? data.finishedAt : null,
    savedAt: isDate(data.savedAt) ? data.savedAt : new Date(0).toISOString(),
  };
}

export function readSaved(storage: StorageLike | null, key: string, model: ReviewModel): SavedReview | null {
  if (!storage) return null;
  try {
    return parseSaved(storage.getItem(key), model);
  } catch {
    return null;
  }
}

/** Returns false when saving failed (storage full or blocked). */
export function writeSaved(
  storage: StorageLike | null,
  key: string,
  data: Omit<SavedReview, 'version' | 'savedAt' | 'applied'> & { applied?: string[] },
): boolean {
  if (!storage) return false;
  try {
    const empty =
      Object.keys(data.decisions).length === 0 &&
      Object.keys(data.comments).length === 0 &&
      (data.applied?.length ?? 0) === 0 &&
      !data.finishedAt;
    if (empty) {
      storage.removeItem(key); // nothing to keep: do not leave an empty record behind
      return true;
    }
    const record: SavedReview = { version: 1, savedAt: new Date().toISOString(), ...data, applied: data.applied ?? [] };
    storage.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

export function keyFor(file: Pick<FindingsFile, 'documentId' | 'agent'>, contractId: string): string {
  return storageKey(file.documentId || contractId, file.agent);
}
