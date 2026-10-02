import { findAll, normalizeWithMap, type NormalizedText } from './text';
import type { AnchorStatus, Contract, DataIssue, Finding, Span } from './types';

// RULE: the quote is the truth. Offsets are only a hint.
// We highlight text only when we have checked that it matches the quote.

interface IndexedParagraph {
  id: string;
  text: string;
  index: number; // position in the whole document, used for ordering
  norm?: NormalizedText; // computed lazily, cached
}

export interface ParagraphIndex {
  ordered: IndexedParagraph[];
  byId: Map<string, IndexedParagraph>;
}

export function indexContract(contract: Contract): { index: ParagraphIndex; issues: DataIssue[] } {
  const ordered: IndexedParagraph[] = [];
  const byId = new Map<string, IndexedParagraph>();
  const issues: DataIssue[] = [];
  for (const section of contract.sections ?? []) {
    for (const p of section.paragraphs ?? []) {
      if (byId.has(p.id)) {
        issues.push({ kind: 'duplicate-paragraph-id', message: `Paragraph id ${p.id} appears twice; the first one is used.` });
        continue;
      }
      const entry: IndexedParagraph = { id: p.id, text: p.text ?? '', index: ordered.length };
      ordered.push(entry);
      byId.set(p.id, entry);
    }
  }
  return { index: { ordered, byId }, issues };
}

function norm(p: IndexedParagraph): NormalizedText {
  return (p.norm ??= normalizeWithMap(p.text));
}

// ---- A "region" is the text from the first anchor paragraph to the last, joined by one space.
// For a normal anchor it is just one paragraph.

interface Region {
  parts: { paragraphId: string; text: string; offset: number }[];
  joined: string;
}

function buildRegion(idx: ParagraphIndex, startId: string, endId: string): Region | null {
  const s = idx.byId.get(startId);
  const e = idx.byId.get(endId);
  if (!s || !e || e.index < s.index) return null;
  const parts: Region['parts'] = [];
  let joined = '';
  for (let i = s.index; i <= e.index; i++) {
    const p = idx.ordered[i]!;
    if (i > s.index) joined += ' ';
    parts.push({ paragraphId: p.id, text: p.text, offset: joined.length });
    joined += p.text;
  }
  return { parts, joined };
}

/** Cut a range of the joined region back into one span per paragraph. */
function spansIn(region: Region, rs: number, re: number, findingId: string): Span[] {
  const spans: Span[] = [];
  for (const part of region.parts) {
    const start = Math.max(rs, part.offset);
    const end = Math.min(re, part.offset + part.text.length);
    if (end > start) {
      spans.push({ findingId, paragraphId: part.paragraphId, start: start - part.offset, end: end - part.offset });
    }
  }
  return spans;
}

/** Are the saved offsets even possible? If yes, where do they land in the region? */
function offsetsInRegion(
  start: unknown,
  end: unknown,
  region: Region,
): { rs: number; re: number } | null {
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  const s = start as number;
  const e = end as number;
  const first = region.parts[0]!;
  const last = region.parts[region.parts.length - 1]!;
  if (s < 0 || s > first.text.length) return null;
  if (e < 0 || e > last.text.length) return null;
  const rs = s;
  const re = last.offset + e;
  return re > rs ? { rs, re } : null;
}

export interface AnchorResolution {
  status: AnchorStatus;
  note: string | null;
  spans: Span[];
  homeParagraphId: string | null;
}

function result(
  status: AnchorStatus,
  note: string | null,
  spans: Span[],
  fallbackHome: string | null,
): AnchorResolution {
  return { status, note, spans, homeParagraphId: spans[0]?.paragraphId ?? fallbackHome };
}

export function resolveAnchor(finding: Finding, idx: ParagraphIndex): AnchorResolution {
  const a = finding.anchor;
  if (!a) return { status: 'none', note: null, spans: [], homeParagraphId: null };

  const home = idx.byId.has(a.paragraphId) ? a.paragraphId : null;
  const quote = typeof a.quote === 'string' ? normalizeWithMap(a.quote).text : '';
  if (!quote) {
    return result('unresolved', 'This finding has no quote, so its location could not be checked.', [], home);
  }

  const endId = a.endParagraphId ?? a.paragraphId;
  const region = buildRegion(idx, a.paragraphId, endId);

  if (region) {
    // 1. Do the saved offsets point at the quote?
    const bounds = offsetsInRegion(a.start, a.end, region);
    if (bounds) {
      const atOffsets = normalizeWithMap(region.joined.slice(bounds.rs, bounds.re)).text;
      if (atOffsets === quote) {
        return result('exact', null, spansIn(region, bounds.rs, bounds.re, finding.id), home);
      }
    }

    // 2. Offsets are wrong. Search for the quote inside the same region.
    const n = normalizeWithMap(region.joined);
    const hits = findAll(n.text, quote);
    if (hits.length > 0) {
      const target = bounds?.rs ?? (Number.isFinite(a.start) ? a.start : 0);
      let best = hits[0]!;
      for (const h of hits) {
        if (Math.abs(n.map[h]! - target) < Math.abs(n.map[best]! - target)) best = h;
      }
      const rs = n.map[best]!;
      const re = n.map[best + quote.length - 1]! + 1;
      const many = hits.length > 1 ? ` The quote appears ${hits.length} times here; the closest one to the saved position was used.` : '';
      return result(
        'repaired',
        `The saved position did not match the quote, so the quote was found by searching.${many} Location is approximate.`,
        spansIn(region, rs, re, finding.id),
        home,
      );
    }
    return result('unresolved', `The quoted text was not found in ${a.paragraphId}.`, [], home);
  }

  // 3. The paragraph ids are unusable (missing, or end before start).
  // Search every paragraph, but accept only ONE clear match.
  const matches: { p: IndexedParagraph; pos: number }[] = [];
  for (const p of idx.ordered) {
    for (const pos of findAll(norm(p).text, quote)) matches.push({ p, pos });
  }
  if (matches.length === 1) {
    const { p, pos } = matches[0]!;
    const n = norm(p);
    const span: Span = {
      findingId: finding.id,
      paragraphId: p.id,
      start: n.map[pos]!,
      end: n.map[pos + quote.length - 1]! + 1,
    };
    return result(
      'repaired',
      `The paragraph reference in the finding was not valid, so the quote was found by searching (${p.id}). Location is approximate.`,
      [span],
      p.id,
    );
  }
  const why = matches.length === 0 ? 'The quoted text was not found anywhere in the document.' : `The quoted text appears in ${matches.length} places, so its location is ambiguous.`;
  return result('unresolved', why, [], null);
}
