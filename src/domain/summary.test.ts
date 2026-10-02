import { describe, expect, it } from 'vitest';
import { buildReviewModel } from './model';
import { buildSummary, summaryToMarkdown } from './summary';
import contractJson from '../../data/sample-contract.json';
import findingsJson from '../../data/findings.json';
import type { Contract, FindingsFile } from './types';

const contract = contractJson as unknown as Contract;
const file = findingsJson as unknown as FindingsFile;
const model = buildReviewModel(contract, file);

describe('buildSummary (real data)', () => {
  it('puts every finding in exactly one group', () => {
    const s = buildSummary(model, contract, { 'f-08': 'accepted', 'f-24': 'dismissed' }, {});
    expect(s.groups.accepted.map((i) => i.finding.id)).toEqual(['f-08']);
    expect(s.groups.dismissed.map((i) => i.finding.id)).toEqual(['f-24']);
    expect(s.groups.pending).toHaveLength(22);
    expect(s.total).toBe(24);
  });

  it('counts undecided findings by severity', () => {
    const s = buildSummary(model, contract, { 'f-08': 'accepted' }, {});
    expect(s.pendingBySeverity).toEqual({ high: 8, medium: 11, low: 4 });
  });

  it('lists High before Medium before Low, top to bottom inside each', () => {
    const s = buildSummary(model, contract, {}, {});
    const sev = s.groups.pending.map((i) => i.finding.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)));
  });

  it('describes locations in words', () => {
    const s = buildSummary(model, contract, {}, {});
    const loc = (id: string) => s.groups.pending.find((i) => i.finding.id === id)?.location;
    expect(loc('f-09')).toBe('Whole document');
    expect(loc('f-08')).toBe('Clause 9.2');
    expect(loc('f-20')).toBe('Clause 11.3 (location approximate)');
  });

  it('names the whole range for a finding that runs across paragraphs', () => {
    const s = buildSummary(model, contract, {}, {});
    expect(s.groups.pending.find((i) => i.finding.id === 'f-02')?.location).toBe('Clauses 3.4–3.5');
  });

  it('only offers original text when the location was verified', () => {
    const s = buildSummary(model, contract, {}, {});
    const item = (id: string) => s.groups.pending.find((i) => i.finding.id === id)!;
    expect(item('f-20').originalText).toContain('labor shortages');
    expect(item('f-09').originalText).toBeNull();
  });

  it('attaches comments', () => {
    const c = { id: 'c1', text: 'Ask Dana', createdAt: '2026-09-21T10:00:00Z' };
    const s = buildSummary(model, contract, {}, { 'f-08': [c] });
    expect(s.groups.pending.find((i) => i.finding.id === 'f-08')?.comments).toEqual([c]);
  });
});

describe('summaryToMarkdown', () => {
  const c = { id: 'c1', text: 'Line one\nLine two', createdAt: '2026-09-21T10:00:00Z' };
  const md = summaryToMarkdown(buildSummary(model, contract, { 'f-08': 'accepted' }, { 'f-08': [c] }), {
    title: 'MSA',
    agent: { name: 'Agent', version: '2.3.1' },
    finishedAt: null,
  });
  it('has counts and groups', () => {
    expect(md).toContain('# Review summary: MSA');
    expect(md).toContain('- Accepted: 1');
    expect(md).toContain('- Not yet decided: 23');
    expect(md).toContain('## Accepted (1)');
    expect(md).toContain('Review not finished yet');
  });
  it('quotes every line of a multi-line comment', () => {
    expect(md).toContain('> Line one\n> Line two');
  });
  it('includes the suggested change, with the text it replaces', () => {
    expect(md).toContain('**Suggested change:**');
    expect(md).toMatch(/\*\*Original text:\*\* [^\n]+\n\n\*\*Suggested change:\*\*/);
  });
});

describe('the document text and the resulting sentence in the export', () => {
  const items = buildSummary(model, contract, {}, {}).groups.pending;
  const item = (id: string) => items.find((i) => i.finding.id === id)!;

  it('quotes the original words from the DOCUMENT, not from the agent', () => {
    // f-20: the agent's saved offsets were wrong; the words must be what is really in the contract
    expect(item('f-20').originalText).toBe('labor shortages, failures of subcontractors or hosting providers');
    expect(item('f-08').originalText).toBe(
      'SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO VENDOR IN THE ONE (1) MONTH PRECEDING THE EVENT GIVING RISE TO THE CLAIM',
    );
  });

  it('gives the full sentence as it would read after the change, for exact anchors only', () => {
    expect(item('f-08').sentenceAfter).toMatch(/PAID OR PAYABLE BY CUSTOMER TO VENDOR IN THE TWELVE \(12\) MONTHS PRECEDING/);
    expect(item('f-20').sentenceAfter).toBeNull(); // approximate location: no sentence claimed
    expect(item('f-09').sentenceAfter).toBeNull(); // whole document
  });

  it('prints it in the Markdown export', () => {
    const md = summaryToMarkdown(buildSummary(model, contract, {}, {}), { title: 'T', finishedAt: null });
    expect(md).toContain('**Reads after the change:** VENDOR’S TOTAL CUMULATIVE LIABILITY');
  });
});

