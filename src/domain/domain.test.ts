import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { buildReviewModel, compareByPriority, parseFindings, pickPrimary } from './model';
import { buildSegments } from './segments';
import { normalizeWithMap } from './text';
import type { Contract, FindingsFile } from './types';

// ---- Real paragraphs copied from the assignment (curly quotes kept) ----
const P_3_4 =
  'Upon expiration or termination of this Agreement for any reason, Customer shall pay Vendor all fees accrued through the effective date of termination. Customer may request the return of Customer Data by written notice delivered within ten (10) days after the effective date of termination.';
const P_3_5 =
  'Following such ten (10) day period, Vendor shall have no obligation to retain any Customer Data and may delete it in its sole discretion, without further notice to Customer. Sections 1, 4, 5, 6, 8, 9, and 11 shall survive any expiration or termination of this Agreement.';
const P_4_3 =
  'Any amount not paid within fifteen (15) days after the invoice date shall accrue interest at a rate of one and one-half percent (1.5%) per month, or the maximum rate permitted by law, whichever is lower. Vendor may suspend the Services upon five (5) days’ notice if any amount remains unpaid.';
const P_6_2 =
  'Vendor retains all right, title, and interest in and to the Deliverables, its pre-existing materials, and any improvements, enhancements, or derivative works thereof, including any models or insights derived from Customer Data. Vendor may use aggregated and anonymized data derived from Customer Data for any purpose, including to improve and market its products and services.';
const P_9_2 =
  'VENDOR’S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO VENDOR IN THE ONE (1) MONTH PRECEDING THE EVENT GIVING RISE TO THE CLAIM. THE FOREGOING LIMITATIONS SHALL NOT APPLY TO CUSTOMER’S PAYMENT OBLIGATIONS OR CUSTOMER’S INDEMNIFICATION OBLIGATIONS UNDER SECTION 8.2.';

const contract: Contract = {
  id: 'doc-1',
  title: 'Test MSA',
  sections: [
    { id: 's-0', number: null, heading: 'Preamble', paragraphs: [{ id: 'p-0.1', number: null, text: 'Intro text.' }] },
    {
      id: 's-3',
      number: '3',
      heading: 'Term',
      paragraphs: [
        { id: 'p-3.4', number: '3.4', text: P_3_4 },
        { id: 'p-3.5', number: '3.5', text: P_3_5 },
      ],
    },
    { id: 's-4', number: '4', heading: 'Fees', paragraphs: [{ id: 'p-4.3', number: '4.3', text: P_4_3 }] },
    { id: 's-6', number: '6', heading: 'IP', paragraphs: [{ id: 'p-6.2', number: '6.2', text: P_6_2 }] },
    { id: 's-9', number: '9', heading: 'Liability', paragraphs: [{ id: 'p-9.2', number: '9.2', text: P_9_2 }] },
  ],
};

const base = { category: 'Test', explanation: 'x', suggestedEdit: null, confidence: 0.9 };

// Real findings from the assignment
const f02 = {
  ...base, id: 'f-02', severity: 'high', title: 'Data return window',
  anchor: {
    paragraphId: 'p-3.4', start: 151, endParagraphId: 'p-3.5', end: 173,
    quote:
      'Customer may request the return of Customer Data by written notice delivered within ten (10) days after the effective date of termination. Following such ten (10) day period, Vendor shall have no obligation to retain any Customer Data and may delete it in its sole discretion, without further notice to Customer.',
  },
};
const f04 = {
  ...base, id: 'f-04', severity: 'high', title: 'Vendor owns deliverables',
  anchor: { paragraphId: 'p-6.2', start: 0, end: 227, quote: P_6_2.slice(0, 227) },
};
const f05 = {
  ...base, id: 'f-05', severity: 'high', title: 'Unrestricted derived data', confidence: 0.79,
  anchor: { paragraphId: 'p-6.2', start: 167, end: 376, quote: P_6_2.slice(167, 376) },
};
const f08 = {
  ...base, id: 'f-08', severity: 'high', title: 'Liability cap',
  anchor: {
    paragraphId: 'p-9.2', start: 81, end: 199,
    quote: 'SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO VENDOR IN THE ONE (1) MONTH PRECEDING THE EVENT GIVING RISE TO THE CLAIM',
  },
};
const f13 = {
  ...base, id: 'f-13', severity: 'medium', title: 'Conflicting payment terms',
  anchor: { paragraphId: 'p-4.3', start: 0, end: 67, quote: 'Any amount not paid within fifteen (15) days after the invoice date' },
};
const f22 = {
  ...base, id: 'f-22', severity: 'low', title: 'Suspension',
  anchor: {
    paragraphId: 'p-4.3', start: 204, end: 292,
    quote: 'Vendor may suspend the Services upon five (5) days’ notice if any amount remains unpaid.',
  },
};
const f09 = { ...base, id: 'f-09', severity: 'high', title: 'Missing clause', anchor: null };

const file = (findings: unknown[]): FindingsFile => ({ documentId: 'doc-1', findings });
const get = (m: ReturnType<typeof buildReviewModel>, id: string) => m.byId.get(id)!;

describe('anchor checking with the real data', () => {
  const m = buildReviewModel(contract, file([f02, f04, f05, f08, f13, f22, f09]));

  it('marks every correct anchor as exact', () => {
    for (const id of ['f-02', 'f-04', 'f-05', 'f-08', 'f-13', 'f-22']) {
      expect(get(m, id).anchorStatus, id).toBe('exact');
    }
  });

  it('splits the cross-paragraph anchor (f-02) into one span per paragraph', () => {
    expect(get(m, 'f-02').spans).toEqual([
      { findingId: 'f-02', paragraphId: 'p-3.4', start: 151, end: P_3_4.length },
      { findingId: 'f-02', paragraphId: 'p-3.5', start: 0, end: 173 },
    ]);
    expect(get(m, 'f-02').homeParagraphId).toBe('p-3.4');
  });

  it('treats a null anchor as document-level', () => {
    expect(get(m, 'f-09').anchorStatus).toBe('none');
    expect(m.documentLevel).toEqual(['f-09']);
  });

  it('puts both findings of one paragraph in the same row, most important first', () => {
    expect(m.cardsByParagraph.get('p-4.3')).toEqual(['f-13', 'f-22']);
    expect(m.cardsByParagraph.get('p-6.2')).toEqual(['f-04', 'f-05']); // same severity, higher confidence first
  });

  it('only exact anchors with a suggested edit are editable', () => {
    const withEdit = buildReviewModel(contract, file([{ ...f08, suggestedEdit: 'NEW TEXT' }]));
    expect(get(withEdit, 'f-08').editable).toBe(true);
    expect(get(m, 'f-08').editable).toBe(false); // no suggested edit
  });
});

describe('messy anchors', () => {
  it('repairs wrong offsets by finding the quote', () => {
    const m = buildReviewModel(contract, file([{ ...f08, anchor: { ...f08.anchor, start: 90, end: 208 } }]));
    const f = get(m, 'f-08');
    expect(f.anchorStatus).toBe('repaired');
    expect(f.spans).toEqual([{ findingId: 'f-08', paragraphId: 'p-9.2', start: 81, end: 199 }]);
    expect(f.anchorNote).toMatch(/approximate/i);
    expect(f.editable).toBe(false); // never apply an edit on a repaired anchor
  });

  it('repairs offsets that are outside the paragraph', () => {
    const m = buildReviewModel(contract, file([{ ...f13, anchor: { ...f13.anchor, start: 5000, end: 6000 } }]));
    expect(get(m, 'f-13').anchorStatus).toBe('repaired');
    expect(get(m, 'f-13').spans[0]).toMatchObject({ start: 0, end: 67 });
  });

  it('accepts a quote that only differs by apostrophe style and spacing', () => {
    const quote = "Vendor may  suspend the Services upon five (5) days' notice if any amount remains unpaid.";
    const m = buildReviewModel(contract, file([{ ...f22, anchor: { ...f22.anchor, quote } }]));
    expect(get(m, 'f-22').anchorStatus).toBe('exact');
    expect(get(m, 'f-22').spans[0]).toMatchObject({ start: 204, end: 292 });
  });

  it('does NOT highlight when the wording differs (wrong text must never be shown)', () => {
    const m = buildReviewModel(contract, file([{ ...f13, anchor: { ...f13.anchor, quote: 'Any amount not paid within twenty (20) days' } }]));
    const f = get(m, 'f-13');
    expect(f.anchorStatus).toBe('unresolved');
    expect(f.spans).toEqual([]);
    expect(f.homeParagraphId).toBe('p-4.3'); // still shown in the right row, with a warning
  });

  it('is case sensitive', () => {
    const m = buildReviewModel(contract, file([{ ...f13, anchor: { ...f13.anchor, quote: f13.anchor.quote.toUpperCase() } }]));
    expect(get(m, 'f-13').anchorStatus).toBe('unresolved');
  });

  it('finds a quote when the paragraph id is wrong, if there is exactly one match', () => {
    const m = buildReviewModel(contract, file([{ ...f08, anchor: { ...f08.anchor, paragraphId: 'p-99.9' } }]));
    const f = get(m, 'f-08');
    expect(f.anchorStatus).toBe('repaired');
    expect(f.homeParagraphId).toBe('p-9.2');
  });

  it('refuses to guess when the quote appears in several places', () => {
    const dup: Contract = {
      ...contract,
      sections: [{ id: 's', number: '1', heading: 'h', paragraphs: [
        { id: 'a', number: '1', text: 'The same sentence here.' },
        { id: 'b', number: '2', text: 'The same sentence here.' },
      ] }],
    };
    const m = buildReviewModel(dup, file([{ ...base, id: 'x', severity: 'low', title: 't', anchor: { paragraphId: 'zzz', start: 0, end: 5, quote: 'The same sentence here.' } }]));
    expect(get(m, 'x').anchorStatus).toBe('unresolved');
    expect(get(m, 'x').homeParagraphId).toBeNull();
    expect(m.documentLevel).toEqual(['x']);
  });

  it('does not trust a finding with no quote', () => {
    const m = buildReviewModel(contract, file([{ ...f13, anchor: { paragraphId: 'p-4.3', start: 0, end: 67 } }]));
    expect(get(m, 'f-13').anchorStatus).toBe('unresolved');
  });

  it('rejects a cross-paragraph anchor whose end paragraph comes before its start', () => {
    const m = buildReviewModel(contract, file([{ ...f02, anchor: { ...f02.anchor, paragraphId: 'p-3.5', endParagraphId: 'p-3.4' } }]));
    expect(get(m, 'f-02').anchorStatus).toBe('unresolved'); // quote spans two paragraphs, so a global search cannot find it
  });
});

describe('bad findings data', () => {
  it('reports unusable findings instead of dropping them silently', () => {
    const { findings, issues } = parseFindings([
      f13,
      { ...f22, severity: 'urgent' },
      { ...f09, id: '' },
      f13,
      'nonsense',
      { ...f08, confidence: 1.7 },
    ]);
    expect(findings.map((f) => f.id)).toEqual(['f-13', 'f-08']);
    expect(findings[1]!.confidence).toBe(1);
    expect(issues.map((i) => i.kind).sort()).toEqual(
      ['confidence-adjusted', 'duplicate-finding-id', 'finding-skipped', 'finding-skipped', 'finding-skipped'].sort(),
    );
  });

  it('keeps a missing confidence as null, not zero', () => {
    const { findings } = parseFindings([{ ...f13, confidence: undefined }]);
    expect(findings[0]!.confidence).toBeNull();
  });

  it('warns when the findings belong to a different document', () => {
    const m = buildReviewModel(contract, { documentId: 'other', findings: [f13] });
    expect(m.issues.some((i) => i.kind === 'document-mismatch')).toBe(true);
  });
});

describe('overlapping highlights (segments)', () => {
  it('cuts f-04 and f-05 into three pieces', () => {
    const m = buildReviewModel(contract, file([f04, f05]));
    const segs = buildSegments(P_6_2, m.spansByParagraph.get('p-6.2')!);
    expect(segs.map((s) => [s.start, s.end, s.findingIds])).toEqual([
      [0, 167, ['f-04']],
      [167, 227, ['f-04', 'f-05']],
      [227, 376, ['f-05']],
    ]);
  });

  it('returns plain text when there are no highlights', () => {
    expect(buildSegments('hello', [])).toEqual([{ start: 0, end: 5, text: 'hello', findingIds: [] }]);
    expect(buildSegments('', [])).toEqual([]);
  });

  it('ignores empty and reversed ranges and clamps ranges outside the text', () => {
    const segs = buildSegments('abcdef', [
      { findingId: 'a', start: 3, end: 3 },
      { findingId: 'b', start: 5, end: 2 },
      { findingId: 'c', start: -10, end: 99 },
    ]);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({ start: 0, end: 6, findingIds: ['c'] });
  });

  it('always rebuilds the exact original text (random ranges)', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let run = 0; run < 300; run++) {
      const text = P_6_2.slice(0, 20 + Math.floor(rnd() * 300));
      const ranges = Array.from({ length: Math.floor(rnd() * 6) }, (_, i) => {
        const a = Math.floor(rnd() * text.length);
        const b = Math.floor(rnd() * text.length);
        return { findingId: `f${i}`, start: Math.min(a, b), end: Math.max(a, b) };
      });
      const segs = buildSegments(text, ranges);
      expect(segs.map((s) => s.text).join('')).toBe(text);
      for (let i = 1; i < segs.length; i++) expect(segs[i]!.start).toBe(segs[i - 1]!.end);
      // a finding covers a piece exactly when the piece lies inside its range
      for (const s of segs) {
        for (const r of ranges) {
          const covers = r.start <= s.start && r.end >= s.end && r.end > r.start;
          expect(s.findingIds.includes(r.findingId)).toBe(covers);
        }
      }
    }
  });

  it('chooses the highest-severity finding when a click lands on an overlap', () => {
    const m = buildReviewModel(contract, file([f13, f22]));
    expect(pickPrimary(['f-22', 'f-13'], m.byId)).toBe('f-13');
    expect(pickPrimary([], m.byId)).toBeUndefined();
  });
});

describe('priority order', () => {
  it('sorts by severity, then confidence, then id', () => {
    const { findings } = parseFindings([
      { ...f22, id: 'c', confidence: 0.5 },
      { ...f04, id: 'b', confidence: 0.8 },
      { ...f04, id: 'a', confidence: 0.8 },
      { ...f13, id: 'd', confidence: 0.99 },
    ]);
    expect(findings.sort(compareByPriority).map((f) => f.id)).toEqual(['a', 'b', 'd', 'c']);
  });
});

describe('text normalization', () => {
  it('maps normalized positions back to the original text', () => {
    const n = normalizeWithMap('a  ’b\u200B c');
    expect(n.text).toBe("a 'b c");
    expect(n.map.map((i) => 'a  ’b\u200B c'[i])).toEqual(['a', ' ', '’', 'b', ' ', 'c']);
  });
});

// ---- If the real files are placed in /data, check them too ----
const contractPath = fileURLToPath(new URL('../../data/sample-contract.json', import.meta.url));
const findingsPath = fileURLToPath(new URL('../../data/findings.json', import.meta.url));

describe.skipIf(!existsSync(contractPath) || !existsSync(findingsPath))('the real data files in /data', () => {
  it('loads, and reports every finding that is not an exact match', () => {
    const real = buildReviewModel(JSON.parse(readFileSync(contractPath, 'utf8')), JSON.parse(readFileSync(findingsPath, 'utf8')));
    const rows = real.findings.map((f) => ({ id: f.id, status: f.anchorStatus, note: f.anchorNote ?? '' }));
    console.table(rows.filter((r) => r.status !== 'exact' && r.status !== 'none'));
    console.log('issues:', real.issues);
    expect(real.findings.length).toBeGreaterThan(0);
  });
});
