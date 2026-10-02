import { describe, expect, it } from 'vitest';
import { paragraphLookup } from './diff';
import { applyToText, conflictingApplied, editFor, editsByParagraph, redlineSegments, sanitizeApplied } from './edits';
import { buildReviewModel } from './model';
import { buildSummary, summaryToMarkdown } from './summary';
import contractJson from '../../data/sample-contract.json';
import findingsJson from '../../data/findings.json';
import type { Contract, FindingsFile } from './types';

// Real contract and real findings from the assignment.
const contract = contractJson as unknown as Contract;
const model = buildReviewModel(contract, findingsJson as unknown as FindingsFile);
const lookup = paragraphLookup(contract);
const find = (id: string) => model.byId.get(id)!;

describe('editFor', () => {
  it('builds a replacement for every editable finding in the real data', () => {
    const editable = model.findings.filter((f) => f.editable);
    expect(editable).toHaveLength(17);
    for (const f of editable) expect(editFor(f, lookup), f.id).not.toBeNull();
  });

  it('refuses everything that is not editable: repaired, cross-paragraph, no suggestion', () => {
    expect(editFor(find('f-20'), lookup)).toBeNull(); // repaired location
    expect(editFor(find('f-02'), lookup)).toBeNull(); // runs across 3.4 and 3.5
    expect(editFor(find('f-10'), lookup)).toBeNull(); // no suggested edit
    expect(editFor(find('f-09'), lookup)).toBeNull(); // whole document
  });

  it('refuses a suggestion that equals the current words', () => {
    const f = find('f-08');
    const same = { ...f, suggestedEdit: lookup.get('p-9.2')!.text.slice(f.spans[0]!.start, f.spans[0]!.end) };
    expect(editFor(same, lookup)).toBeNull();
  });

  it('keeps the spaces around the replaced words', () => {
    const f = find('f-08');
    const padded = { ...f, spans: [{ ...f.spans[0]!, end: f.spans[0]!.end + 0 }] };
    const e = editFor(padded, lookup)!;
    expect(e.replacement).toBe(f.suggestedEdit!.trim());
    expect(lookup.get('p-9.2')!.text.slice(e.start, e.end)).toBe(lookup.get('p-9.2')!.text.slice(e.start, e.end).trim());
  });
});

describe('conflicts', () => {
  it('f-04 and f-05 overlap on 6.2, so the second cannot be applied', () => {
    expect(conflictingApplied(model, ['f-04'], 'f-05')).toEqual(['f-04']);
    expect(conflictingApplied(model, ['f-05'], 'f-04')).toEqual(['f-05']);
  });

  it('is the only conflicting pair among the real editable findings', () => {
    const ids = model.findings.filter((f) => f.editable).map((f) => f.id);
    const pairs: string[] = [];
    for (const a of ids) for (const b of ids) if (a < b && conflictingApplied(model, [a], b).length > 0) pairs.push(`${a}/${b}`);
    expect(pairs).toEqual(['f-04/f-05']);
  });

  it('two edits in one paragraph that do not touch (f-13, f-22 in 4.3) are both fine', () => {
    expect(conflictingApplied(model, ['f-13'], 'f-22')).toEqual([]);
  });

  it('a finding never conflicts with itself', () => {
    expect(conflictingApplied(model, ['f-04'], 'f-04')).toEqual([]);
  });
});

describe('sanitizeApplied (used on saved data)', () => {
  const accepted = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, 'accepted' as const]));
  it('keeps good ids in order', () => {
    expect(sanitizeApplied(['f-13', 'f-22'], model, accepted('f-13', 'f-22'))).toEqual(['f-13', 'f-22']);
  });
  it('drops unknown ids, duplicates, junk, and ids that are not accepted', () => {
    expect(sanitizeApplied(['f-04', 'f-04', 'nope', 7, null, 'f-13'], model, accepted('f-04'))).toEqual(['f-04']);
  });
  it('drops findings that can never be applied', () => {
    expect(sanitizeApplied(['f-02', 'f-20', 'f-10'], model, accepted('f-02', 'f-20', 'f-10'))).toEqual([]);
  });
  it('keeps the first of two overlapping edits', () => {
    expect(sanitizeApplied(['f-05', 'f-04'], model, accepted('f-04', 'f-05'))).toEqual(['f-05']);
  });
});

describe('redline and revised text', () => {
  const allAccepted = Object.fromEntries(model.findings.map((f) => [f.id, 'accepted' as const]));
  const applied = sanitizeApplied(model.findings.map((f) => f.id), model, allAccepted);
  const byParagraph = editsByParagraph(model, lookup, applied);

  it('applies every compatible edit at once (16 of 17)', () => {
    expect(applied).toHaveLength(16);
  });

  it('for every paragraph: the struck pieces plus the untouched pieces rebuild the original text', () => {
    for (const [paragraphId, edits] of byParagraph) {
      const text = lookup.get(paragraphId)!.text;
      const pieces = redlineSegments(text, [], edits);
      expect(pieces.map((p) => p.text).join(''), paragraphId).toBe(text);
    }
  });

  it('for every paragraph: untouched pieces plus new words equal the revised text, one insertion per edit', () => {
    for (const [paragraphId, edits] of byParagraph) {
      const text = lookup.get(paragraphId)!.text;
      const pieces = redlineSegments(text, [], edits);
      const after = pieces.map((p) => (p.editId ? '' : p.text) + (p.insertion ?? '')).join('');
      expect(after, paragraphId).toBe(applyToText(text, edits));
      expect(pieces.filter((p) => p.insertion !== null), paragraphId).toHaveLength(edits.length);
    }
  });

  it('two edits in 4.3 do not disturb each other (offsets are against the original)', () => {
    const edits = byParagraph.get('p-4.3')!;
    expect(edits.map((e) => e.findingId)).toEqual(['f-13', 'f-22']);
    const revised = applyToText(lookup.get('p-4.3')!.text, edits);
    expect(revised).toContain(edits[0]!.replacement);
    expect(revised).toContain(edits[1]!.replacement);
  });

  it('the original document object is never changed', () => {
    const before = JSON.stringify(contract);
    editsByParagraph(model, lookup, applied);
    for (const [paragraphId, edits] of byParagraph) applyToText(lookup.get(paragraphId)!.text, edits);
    expect(JSON.stringify(contract)).toBe(before);
  });

  it('highlights and edits can share a paragraph: pieces still rebuild the text', () => {
    // f-04 applied while f-05 (overlapping) is still only a highlight
    const text = lookup.get('p-6.2')!.text;
    const edits = editsByParagraph(model, lookup, ['f-04']).get('p-6.2')!;
    const spans = model.spansByParagraph.get('p-6.2')!;
    const pieces = redlineSegments(text, spans, edits);
    expect(pieces.map((p) => p.text).join('')).toBe(text);
    // the words that are both struck and highlighted by f-05 keep f-05's id
    expect(pieces.some((p) => p.editId === 'f-04' && p.findingIds.includes('f-05'))).toBe(true);
    expect(pieces.some((p) => p.findingIds.some((id) => id.startsWith('\u0000')))).toBe(false);
  });

  it('without edits it is the same as buildSegments with empty extras', () => {
    const pieces = redlineSegments('Hello world', [{ findingId: 'a', start: 0, end: 5 }], []);
    expect(pieces.map((p) => [p.text, p.findingIds, p.editId, p.insertion])).toEqual([
      ['Hello', ['a'], null, null],
      [' world', [], null, null],
    ]);
  });
});

describe('summary with applied edits', () => {
  it('counts them and shows the revised clause in the export', () => {
    const decisions = { 'f-08': 'accepted' as const };
    const s = buildSummary(model, contract, decisions, {}, ['f-08']);
    expect(s.appliedCount).toBe(1);
    const item = s.groups.accepted.find((i) => i.finding.id === 'f-08')!;
    expect(item.applied).toBe(true);
    expect(item.revisedParagraph).toContain('TWELVE (12) MONTHS');
    const md = summaryToMarkdown(s, { title: 'T', finishedAt: null });
    expect(md).toContain('Suggested edits applied to the draft: 1');
    expect(md).toContain('**Applied to the draft.**');
  });

  it('ignores ids that are not applicable, so the summary never claims an edit that is not there', () => {
    const s = buildSummary(model, contract, { 'f-02': 'accepted' }, {}, ['f-02']);
    expect(s.appliedCount).toBe(0);
  });

  it('is unchanged when nothing is applied', () => {
    const s = buildSummary(model, contract, {}, {});
    expect(s.appliedCount).toBe(0);
    expect(summaryToMarkdown(s, { title: 'T', finishedAt: null })).not.toContain('applied');
  });
});
