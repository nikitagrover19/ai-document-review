import { buildSegments } from './segments';
import type { ParagraphLookup } from './diff';
import type { Decision, ResolvedFinding, ReviewModel, Segment, Span } from './types';

// Step 9: applying suggested edits.
//
// RULES (decision D4)
//  - The original document never changes. An "applied edit" is only an entry in a separate list
//    (the store keeps just the finding ids, in the order they were applied).
//  - Only findings with `editable === true` can be applied: exact anchor, one paragraph, has a suggestion.
//  - Two applied edits may never touch the same words. The second one is blocked, with a reason.
//  - Everything in this file is calculated from (model + applied ids). Nothing here is stored.

/** One replacement, expressed against the ORIGINAL paragraph text. */
export interface AppliedEdit {
  findingId: string;
  paragraphId: string;
  /** Half-open range of the original text that is replaced. Edge whitespace is not part of it. */
  start: number;
  end: number;
  replacement: string;
}

/**
 * The replacement for one finding, or null when it cannot be applied
 * (not editable, paragraph missing, or the suggestion is identical to the current words).
 * The replaced range excludes spaces at the edges of the anchor, exactly like the redline in the card.
 */
export function editFor(finding: ResolvedFinding, paragraphs: ParagraphLookup): AppliedEdit | null {
  if (!finding.editable || !finding.suggestedEdit || finding.spans.length !== 1) return null;
  const span = finding.spans[0]!;
  const text = paragraphs.get(span.paragraphId)?.text;
  if (text === undefined) return null;
  const covered = text.slice(span.start, span.end);
  const start = span.start + (covered.length - covered.trimStart().length);
  const end = span.end - (covered.length - covered.trimEnd().length);
  const replacement = finding.suggestedEdit.trim();
  if (end <= start || !replacement || text.slice(start, end) === replacement) return null;
  return { findingId: finding.id, paragraphId: span.paragraphId, start, end, replacement };
}

const spansTouch = (a: Span, b: Span) => a.paragraphId === b.paragraphId && a.start < b.end && b.start < a.end;

/**
 * Applied findings whose anchored words overlap this finding's anchored words.
 * Uses the full anchor (not just the replaced range) on purpose: it is simple, it needs no paragraph text,
 * and being slightly strict is the safe side. Touching ranges (one ends where the other starts) do not conflict.
 */
export function conflictingApplied(model: ReviewModel, appliedIds: readonly string[], findingId: string): string[] {
  const mine = model.byId.get(findingId)?.spans ?? [];
  return appliedIds.filter((id) => {
    if (id === findingId) return false;
    const other = model.byId.get(id)?.spans ?? [];
    return mine.some((a) => other.some((b) => spansTouch(a, b)));
  });
}

/**
 * Make a list of applied ids safe for THIS model: it is only used on saved data.
 * Keeps an id only if the finding exists, is editable, is accepted, and does not overlap one kept before it.
 * Order is kept; duplicates and unknown ids are dropped.
 */
export function sanitizeApplied(ids: readonly unknown[], model: ReviewModel, decisions: Record<string, Decision>): string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  // Spans of the findings kept so far, per paragraph, so a candidate is only compared with its own paragraph
  // (comparing with every kept finding made this quadratic: about 1 s for 6,000 findings).
  const taken = new Map<string, Span[]>();
  for (const id of ids) {
    if (typeof id !== 'string' || seen.has(id)) continue;
    seen.add(id);
    const finding = model.byId.get(id);
    if (!finding?.editable || decisions[id] !== 'accepted') continue;
    if (finding.spans.some((a) => taken.get(a.paragraphId)?.some((b) => spansTouch(a, b)))) continue;
    for (const span of finding.spans) taken.set(span.paragraphId, [...(taken.get(span.paragraphId) ?? []), span]);
    kept.push(id);
  }
  return kept;
}

/** Applied edits grouped by paragraph, each list sorted by position. Edits that cannot be built are skipped. */
export function editsByParagraph(
  model: ReviewModel,
  paragraphs: ParagraphLookup,
  appliedIds: readonly string[],
): Map<string, AppliedEdit[]> {
  const map = new Map<string, AppliedEdit[]>();
  for (const id of appliedIds) {
    const finding = model.byId.get(id);
    const edit = finding ? editFor(finding, paragraphs) : null;
    if (!edit) continue;
    const list = map.get(edit.paragraphId) ?? [];
    list.push(edit);
    map.set(edit.paragraphId, list);
  }
  for (const list of map.values()) list.sort((a, b) => a.start - b.start);
  return map;
}

/** The paragraph as it reads once the edits are applied (edits must not overlap). */
export function applyToText(text: string, edits: readonly AppliedEdit[]): string {
  let out = text;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, e.start) + e.replacement + out.slice(e.end);
  }
  return out;
}

/** A piece of the paragraph for the redline view. */
export interface RedlineSegment extends Segment {
  /** Set when this piece is replaced by an applied edit: draw it struck through. */
  editId: string | null;
  /** Set on the LAST struck piece of an edit: the new words to draw right after it. */
  insertion: string | null;
}

const EDIT_TAG = '\u0000edit:';

/**
 * Cut a paragraph at every highlight edge AND every applied-edit edge.
 * Same guarantees as buildSegments: the pieces rebuild the exact original text.
 * The new words are not part of the pieces; they ride along on the last struck piece.
 */
export function redlineSegments(
  text: string,
  highlights: { findingId: string; start: number; end: number }[],
  edits: readonly AppliedEdit[],
): RedlineSegment[] {
  if (edits.length === 0) return buildSegments(text, highlights).map((s) => ({ ...s, editId: null, insertion: null }));
  const tagged = [...highlights, ...edits.map((e) => ({ findingId: EDIT_TAG + e.findingId, start: e.start, end: e.end }))];
  return buildSegments(text, tagged).map((segment) => {
    const tag = segment.findingIds.find((id) => id.startsWith(EDIT_TAG));
    const edit = tag ? edits.find((e) => e.findingId === tag.slice(EDIT_TAG.length)) : undefined;
    return {
      ...segment,
      findingIds: segment.findingIds.filter((id) => !id.startsWith(EDIT_TAG)),
      editId: edit?.findingId ?? null,
      insertion: edit && segment.end === edit.end ? edit.replacement : null,
    };
  });
}
