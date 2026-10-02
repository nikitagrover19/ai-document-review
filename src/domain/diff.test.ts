import { describe, expect, it } from 'vitest';
import contractJson from '../../data/sample-contract.json';
import findingsJson from '../../data/findings.json';
import { buildEditPreview, diffWords, paragraphLookup, previewText, sentenceEnd, sentenceStart } from './diff';
import { buildReviewModel } from './model';
import type { Contract, FindingsFile } from './types';

// The tests run on the REAL assignment data, so they describe what the reviewer will actually see.
const contract = contractJson as unknown as Contract;
const model = buildReviewModel(contract, findingsJson as unknown as FindingsFile);
const lookup = paragraphLookup(contract);
const preview = (id: string) => buildEditPreview(model.byId.get(id)!, lookup);
const text = (id: string, which: 'before' | 'after') => previewText(preview(id)!, which);
const para = (id: string) => lookup.get(id)!.text;

const rebuild = (pieces: { kind: string; text: string }[], keep: 'del' | 'ins') =>
  pieces.filter((p) => p.kind === 'keep' || p.kind === keep).map((p) => p.text).join('');

describe('diffWords', () => {
  it('shows only the words that changed', () => {
    const pieces = diffWords('payable within fifteen (15) days of receipt', 'payable within thirty (30) days of receipt');
    expect(pieces.filter((p) => p.kind === 'del').map((p) => p.text)).toEqual(['fifteen (15']);
    expect(pieces.filter((p) => p.kind === 'ins').map((p) => p.text)).toEqual(['thirty (30']);
  });

  it('reports identical text as all kept, and empty text as nothing', () => {
    expect(diffWords('same words', 'same words')).toEqual([{ kind: 'keep', text: 'same words' }]);
    expect(diffWords('', '')).toEqual([]);
    expect(diffWords('', 'new')).toEqual([{ kind: 'ins', text: 'new' }]);
    expect(diffWords('old', '')).toEqual([{ kind: 'del', text: 'old' }]);
  });

  it('keeps apostrophes and hyphens inside words, so "Customer’s" is one change, not three', () => {
    const pieces = diffWords('Customer’s non-exclusive licence', 'Vendor’s non-exclusive licence');
    expect(pieces.filter((p) => p.kind === 'del').map((p) => p.text)).toEqual(['Customer’s']);
  });

  it('shows a mostly rewritten sentence as one old block and one new block, not confetti', () => {
    const pieces = diffWords(
      'Vendor may terminate this Agreement at any time upon thirty (30) days’ notice.',
      'Either Party may terminate any SOW for convenience upon ninety (90) days’ notice to the other Party.',
    );
    expect(pieces.map((p) => p.kind)).toEqual(['del', 'ins']);
  });

  it('rebuilds both sides exactly, spaces included, for any pair of texts (random test)', () => {
    const words = ['the', 'Vendor', 'shall', 'not', 'exceed', '(1)', 'month,', 'and', 'Customer’s', 'fees.', 'of', 'a'];
    let seed = 7;
    const rand = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
    const make = () => Array.from({ length: rand(14) }, () => words[rand(words.length)]).join(rand(4) === 0 ? '  ' : ' ');
    for (let i = 0; i < 300; i++) {
      const a = make();
      const b = make();
      const pieces = diffWords(a, b);
      expect(rebuild(pieces, 'del')).toBe(a);
      expect(rebuild(pieces, 'ins')).toBe(b);
    }
  });

  it('does not freeze on very long input: it falls back to one block', () => {
    const a = Array.from({ length: 2000 }, (_, i) => `w${i}`).join(' ');
    const b = Array.from({ length: 2000 }, (_, i) => `x${i}`).join(' ');
    const started = Date.now();
    expect(diffWords(a, b)).toEqual([
      { kind: 'del', text: a },
      { kind: 'ins', text: b },
    ]);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe('finding the sentence', () => {
  const text = 'The fee is $5 per Inc. unit. Sec. 4 applies, e.g. here. "Is it?" Yes (see Section 7.2.) It is. Done';

  it('does not break on abbreviations, section numbers or an "e.g."', () => {
    const at = text.indexOf('applies');
    expect(text.slice(sentenceStart(text, at), sentenceEnd(text, at))).toBe('Sec. 4 applies, e.g. here.');
  });

  it('handles quotes and brackets around the final full stop', () => {
    const at = text.indexOf('see Section');
    expect(text.slice(sentenceStart(text, at), sentenceEnd(text, at))).toBe('Yes (see Section 7.2.)');
  });

  it('uses the whole paragraph when there is only one sentence, and works at both edges', () => {
    expect(sentenceStart('One sentence only', 4)).toBe(0);
    expect(sentenceEnd('One sentence only', 4)).toBe('One sentence only'.length);
    expect(sentenceEnd('', 0)).toBe(0);
  });

  it('finds the real sentence around f-08 (an all-caps clause with a "SECTION 8.2." at the end)', () => {
    const f = model.byId.get('f-08')!;
    const span = f.spans[0]!;
    const p = para(span.paragraphId);
    const sentence = p.slice(sentenceStart(p, span.start), sentenceEnd(p, span.end));
    expect(sentence.startsWith('VENDOR’S TOTAL CUMULATIVE LIABILITY')).toBe(true);
    expect(sentence.endsWith('GIVING RISE TO THE CLAIM.')).toBe(true);
  });
});

describe('the preview, on the real findings', () => {
  it('has a preview for every finding that is exact or repaired and has a suggestion, and for no other', () => {
    for (const f of model.findings) {
      const has = preview(f.id) !== null;
      const should = f.suggestedEdit !== null && (f.anchorStatus === 'exact' || f.anchorStatus === 'repaired');
      expect(has, f.id).toBe(should);
    }
  });

  it('puts f-08 in its full sentence and changes only the words that change', () => {
    const p = preview('f-08')!;
    expect(p.mode).toBe('sentence');
    expect(text('f-08', 'before')).toBe(
      'VENDOR’S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO VENDOR IN THE ONE (1) MONTH PRECEDING THE EVENT GIVING RISE TO THE CLAIM.',
    );
    expect(text('f-08', 'after')).toBe(
      'VENDOR’S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID OR PAYABLE BY CUSTOMER TO VENDOR IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM.',
    );
    expect(p.pieces.filter((x) => x.kind === 'del').map((x) => x.text)).toEqual(['ONE (1) MONTH']);
  });

  it('keeps the space before the words that follow a deletion (f-15: "Deliverables[- during the term-] solely")', () => {
    expect(text('f-15', 'before')).toContain('use the Deliverables during the term of this Agreement solely for');
    expect(text('f-15', 'after')).toContain('use the Deliverables solely for');
  });

  it('the "before" text is always a real, unaltered part of the document (for every exact finding)', () => {
    for (const f of model.findings) {
      const p = preview(f.id);
      if (!p || p.mode !== 'sentence' || p.crossesParagraphs) continue;
      expect(para(f.spans[0]!.paragraphId), f.id).toContain(previewText(p, 'before'));
    }
  });

  it('the redline rebuilds both sentences: kept + removed = before, kept + added = after', () => {
    for (const f of model.findings) {
      const p = preview(f.id);
      if (!p || p.crossesParagraphs) continue;
      expect(rebuild(p.pieces, 'del'), f.id).toBe(previewText(p, 'before'));
      expect(rebuild(p.pieces, 'ins'), f.id).toBe(previewText(p, 'after'));
    }
  });

  it('f-02 crosses two clauses: shows both removed, then the new text, and says so', () => {
    const p = preview('f-02')!;
    expect(p.crossesParagraphs).toBe(true);
    expect(p.clauses).toEqual(['3.4', '3.5']);
    expect(p.pieces.map((x) => x.kind)).toEqual(['del', 'break', 'del', 'ins']);
    expect(text('f-02', 'before')).toContain('Customer may request the return of Customer Data');
    expect(text('f-02', 'before')).toContain('without further notice to Customer.');
    // the sentence after the change in 3.5 ("Sections 1, 4, ... shall survive") is not pulled in
    expect(text('f-02', 'before')).not.toContain('shall survive');
  });

  it('f-02 can be previewed but never applied (that would merge two paragraphs)', () => {
    expect(model.byId.get('f-02')!.editable).toBe(false);
    expect(model.byId.get('f-08')!.editable).toBe(true);
  });

  it('f-20 has an approximate location: only the replaced words, no sentence, and no warnings', () => {
    const p = preview('f-20')!;
    expect(p.mode).toBe('span');
    expect(p.note).toMatch(/approximate/);
    expect(p.warnings).toEqual([]);
    expect(text('f-20', 'before')).toBe('labor shortages, failures of subcontractors or hosting providers');
    expect(model.byId.get('f-20')!.editable).toBe(false);
  });

  it('has nothing to preview for findings without a suggestion or without a place', () => {
    expect(preview('f-09')).toBeNull(); // whole document
    expect(preview('f-10')).toBeNull(); // no suggested edit
  });

  it('warns about a doubled comma where f-14 meets the text after it', () => {
    expect(preview('f-14')!.warnings[0]).toMatch(/doubled/);
  });

  it('warns that f-05 starts a new sentence in the middle of one', () => {
    expect(preview('f-05')!.warnings[0]).toMatch(/capital letter in the middle/);
  });

  it('raises no warning for any other finding (guards against false alarms)', () => {
    const withWarnings = model.findings.filter((f) => (preview(f.id)?.warnings.length ?? 0) > 0).map((f) => f.id);
    expect(withWarnings).toEqual(['f-05', 'f-14']);
  });

  it('flags a suggestion that equals the current text', () => {
    const f = { ...model.byId.get('f-08')!, suggestedEdit: model.byId.get('f-08')!.anchor!.quote };
    expect(buildEditPreview(f, lookup)!.unchanged).toBe(true);
  });

  it('never shows an unverified (unresolved) finding against the document', () => {
    const f = { ...model.byId.get('f-08')!, anchorStatus: 'unresolved' as const, spans: [] };
    expect(buildEditPreview(f, lookup)).toBeNull();
  });
});
