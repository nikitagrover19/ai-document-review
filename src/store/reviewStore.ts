import { createStore, useStore } from 'zustand';
import { conflictingApplied, editFor } from '../domain/edits';
import { paragraphLookup } from '../domain/diff';
import { buildReviewModel } from '../domain/model';
import { NO_FILTERS } from '../domain/filters';
import { stepPending } from '../domain/navigation';
import type { Contract, Filters, FindingsFile, NavOrder, ReviewComment, ReviewModel } from '../domain/types';
import { fetchReview, readDemoOptions, type LoadedReview } from '../services/reviewService';
import { browserStorage, keyFor, readSaved, writeSaved, type StorageLike } from './persistence';
import type { Decision } from './progress';
import { visibleFindingIds } from './visibility';

export type { Filters };

export type Phase = 'idle' | 'loading' | 'ready' | 'error';
/**
 * Who made the selection. Clicks on the text or on a card happen right next to the thing
 * they select, so we only make sure it is fully on screen. A selection from "Next",
 * "Previous" or the mini-map comes from somewhere else, so we scroll to it.
 * 'key' is a keyboard shortcut: like 'nav', and focus also moves to the opened card.
 */
export type SelectionSource = 'document' | 'card' | 'nav' | 'key';

export type { ReviewComment };

/** idle = nothing saved yet, saved = last write worked, unavailable = this browser cannot save. */
export type SaveStatus = 'idle' | 'saved' | 'unavailable';

export interface ReviewState {
  // --- loading ---
  phase: Phase;
  error: string | null;
  contract: Contract | null;
  meta: Pick<FindingsFile, 'documentId' | 'agent' | 'generatedAt'> | null;
  model: ReviewModel | null;

  // --- the reviewer's work (the part we save in Step 6) ---
  decisions: Record<string, Decision>;
  comments: Record<string, ReviewComment[]>;
  /**
   * Findings whose suggested edit is applied to the draft, in the order applied. Only ids: the redline,
   * the revised text and the conflicts are always calculated (see domain/edits.ts). The original never changes.
   * Invariant: every id here is accepted and editable, and no two overlap.
   */
  applied: string[];
  /** When the reviewer pressed "Finish review" (ISO date). null = still reviewing. */
  finishedAt: string | null;

  // --- screen state (never saved) ---
  selection: { findingId: string; source: SelectionSource } | null;
  filters: Filters;
  navOrder: NavOrder;
  /** Half-typed comments, kept so closing a card never throws away what was typed. */
  drafts: Record<string, string>;
  saveStatus: SaveStatus;

  // --- actions ---
  load: () => Promise<void>;
  select: (findingId: string | null, source?: SelectionSource) => void;
  /** Pass null to put a finding back to pending. */
  decide: (findingId: string, decision: Decision | null) => void;
  addComment: (findingId: string, text: string) => void;
  /** Accept the finding and apply its suggested edit to the draft. Ignored when it cannot be applied. */
  applyEdit: (findingId: string) => void;
  /** Take the edit back out of the draft. The finding stays accepted. */
  revertEdit: (findingId: string) => void;
  setDraft: (findingId: string, text: string) => void;
  setFilters: (patch: Partial<Filters>) => void;
  clearFilters: () => void;
  setNavOrder: (order: NavOrder) => void;
  /** Mark the review as finished. Allowed with undecided findings: the summary warns about them. */
  finish: () => void;
  /** Go back to reviewing. Also happens by itself when a decision changes after finishing. */
  reopen: () => void;
  /** Throw away all decisions and comments (and the saved copy). */
  reset: () => void;
  /** Go to the next (1) or previous (-1) undecided finding, in the chosen order. */
  step: (direction: 1 | -1, source?: 'nav' | 'key') => void;
}

let commentCounter = 0;

export function createReviewStore(loader: () => Promise<LoadedReview>, storage: StorageLike | null = browserStorage()) {
  let storageKeyNow: string | null = null;
  // If the user hits Retry while an older request is still running,
  // only the newest request is allowed to update the screen.
  let latestLoad = 0;

  const store = createStore<ReviewState>()((set, get) => ({
    phase: 'idle',
    error: null,
    contract: null,
    meta: null,
    model: null,
    decisions: {},
    comments: {},
    applied: [],
    finishedAt: null,
    selection: null,
    filters: NO_FILTERS,
    navOrder: 'priority',
    drafts: {},
    saveStatus: 'idle',

    load: async () => {
      const mine = ++latestLoad;
      set({ phase: 'loading', error: null });
      try {
        const { contract, file } = await loader();
        if (mine !== latestLoad) return;
        const model = buildReviewModel(contract, file);
        // Pick up the reviewer's earlier work for this exact document + agent version.
        storageKeyNow = keyFor(file, contract.id);
        const saved = readSaved(storage, storageKeyNow, model);
        set({
          phase: 'ready',
          contract,
          meta: { documentId: file.documentId, agent: file.agent, generatedAt: file.generatedAt },
          model,
          decisions: saved?.decisions ?? {},
          comments: saved?.comments ?? {},
          applied: saved?.applied ?? [],
          finishedAt: saved?.finishedAt ?? null,
          saveStatus: storage ? 'idle' : 'unavailable',
          selection: null,
        });
      } catch (err) {
        if (mine !== latestLoad) return;
        set({ phase: 'error', error: err instanceof Error ? err.message : 'Something went wrong.' });
      }
    },

    select: (findingId, source = 'card') => {
      if (findingId === null) return set({ selection: null });
      if (!get().model?.byId.has(findingId)) return; // ignore unknown ids
      set({ selection: { findingId, source } });
    },

    decide: (findingId, decision) => {
      if (!get().model?.byId.has(findingId)) return;
      const next = { ...get().decisions };
      if (decision === null) delete next[findingId];
      else next[findingId] = decision;
      // An edit can only stay applied while its finding is accepted.
      const applied = decision === 'accepted' ? get().applied : get().applied.filter((id) => id !== findingId);
      // The summary the reviewer saw is out of date once a decision changes.
      set({ decisions: next, applied, finishedAt: null });
    },

    addComment: (findingId, text) => {
      const trimmed = text.trim();
      if (!trimmed || !get().model?.byId.has(findingId)) return;
      const comment: ReviewComment = {
        id: `c-${Date.now()}-${++commentCounter}`,
        text: trimmed,
        createdAt: new Date().toISOString(),
      };
      const existing = get().comments[findingId] ?? [];
      const drafts = { ...get().drafts };
      delete drafts[findingId];
      // The summary includes comments, so a new one makes a finished review out of date, like a new decision does.
      set({ comments: { ...get().comments, [findingId]: [...existing, comment] }, drafts, finishedAt: null });
    },

    applyEdit: (findingId) => {
      const { model, contract, applied, decisions } = get();
      const finding = model?.byId.get(findingId);
      if (!model || !contract || !finding?.editable || applied.includes(findingId)) return;
      if (conflictingApplied(model, applied, findingId).length > 0) return;
      if (!editFor(finding, paragraphLookup(contract))) return;
      set({ applied: [...applied, findingId], decisions: { ...decisions, [findingId]: 'accepted' }, finishedAt: null });
    },

    revertEdit: (findingId) => {
      if (!get().applied.includes(findingId)) return;
      set({ applied: get().applied.filter((id) => id !== findingId), finishedAt: null });
    },

    setDraft: (findingId, text) => set({ drafts: { ...get().drafts, [findingId]: text } }),

    setFilters: (patch) => set({ filters: { ...get().filters, ...patch } }),
    clearFilters: () => set({ filters: NO_FILTERS }),
    setNavOrder: (navOrder) => set({ navOrder }),

    finish: () => {
      if (get().phase === 'ready' && !get().finishedAt) set({ finishedAt: new Date().toISOString() });
    },

    reopen: () => set({ finishedAt: null }),

    reset: () => set({ decisions: {}, comments: {}, applied: [], drafts: {}, finishedAt: null, selection: null }),

    step: (direction, source = 'nav') => {
      const state = get();
      const next = stepPending(
        visibleFindingIds(state),
        (id) => !state.decisions[id],
        state.selection?.findingId ?? null,
        direction,
      );
      if (next) set({ selection: { findingId: next, source } });
    },
  }));

  // Save whenever the reviewer's work changes (and only then: filters, selection and drafts are not saved).
  store.subscribe((state, prev) => {
    const changed =
      state.decisions !== prev.decisions ||
      state.comments !== prev.comments ||
      state.applied !== prev.applied ||
      state.finishedAt !== prev.finishedAt;
    if (!changed || state.phase !== 'ready' || !storageKeyNow) return;
    // The "no findings" demo (and any empty result) must never wipe a saved review.
    if (!state.model || state.model.findings.length === 0) return;
    const ok = writeSaved(storage, storageKeyNow, {
      decisions: state.decisions,
      comments: state.comments,
      applied: state.applied,
      finishedAt: state.finishedAt,
    });
    const status: SaveStatus = ok ? 'saved' : 'unavailable';
    if (state.saveStatus !== status) store.setState({ saveStatus: status });
  });

  return store;
}

/** The app's store. The loader reads the demo switches (?delay, ?fail, ?empty) when it runs. */
export const reviewStore = createReviewStore(() =>
  fetchReview(readDemoOptions(typeof window === 'undefined' ? '' : window.location.search)),
);

export function useReviewStore<T>(selector: (state: ReviewState) => T): T {
  return useStore(reviewStore, selector);
}
