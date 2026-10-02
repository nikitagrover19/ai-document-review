import { describe, expect, it } from 'vitest';
import { buildReviewModel, compareForNavigation } from './model';
import type { Contract } from './types';

// The real sections, severities and confidences from the assignment's findings.json.
const paragraphs = ['1.3','2.2','2.3','3.1','3.3','3.4','4.3','4.4','5.4','6.2','6.3','7.1','7.3','8.1','8.2','9.1','9.2','10.1','11.1','11.2','11.3'];
const contract: Contract = {
  id: 'd',
  title: 't',
  sections: [{ id: 's', number: '1', heading: 'h', paragraphs: paragraphs.map((n) => ({ id: `p-${n}`, number: n, text: 'x'.repeat(400) })) }],
};
const rows: [string, string, number, string, number][] = [
  ['f-01','high',0.93,'3.3',0],['f-02','high',0.88,'3.4',0],['f-03','high',0.91,'4.4',0],['f-04','high',0.86,'6.2',0],['f-05','high',0.79,'6.2',100],
  ['f-06','high',0.90,'8.2',0],['f-07','high',0.84,'9.1',0],['f-08','high',0.92,'9.2',0],['f-09','high',0.87,'',0],
  ['f-10','medium',0.74,'1.3',0],['f-11','medium',0.81,'2.2',0],['f-12','medium',0.77,'3.1',0],['f-13','medium',0.95,'4.3',0],
  ['f-14','medium',0.83,'5.4',0],['f-15','medium',0.72,'6.3',0],['f-16','medium',0.76,'7.1',0],['f-17','medium',0.58,'7.3',0],
  ['f-18','medium',0.70,'8.1',0],['f-19','medium',0.80,'11.2',0],['f-20','medium',0.73,'11.3',0],
  ['f-21','low',0.68,'2.3',0],['f-22','low',0.66,'4.3',200],['f-23','low',0.62,'10.1',0],['f-24','low',0.41,'11.1',0],
];
const findings = rows.map(([id, severity, confidence, para, start]) => ({
  id, severity, confidence, category: 'c', title: id, explanation: '', suggestedEdit: null,
  anchor: para ? { paragraphId: `p-${para}`, start, end: start + 10, quote: 'x'.repeat(10) } : null,
}));
const model = buildReviewModel(contract, { documentId: 'd', findings });
const order = (o: 'priority' | 'document') => [...model.findings].sort(compareForNavigation(o)).map((f) => f.id);

describe('reading order (docIndex)', () => {
  it('puts whole-document findings first, then top to bottom, then by position inside a paragraph', () => {
    const ranked = [...model.findings].sort((a, b) => a.docIndex - b.docIndex).map((f) => f.id);
    expect(ranked.slice(0, 6)).toEqual(['f-09', 'f-10', 'f-11', 'f-21', 'f-12', 'f-01']);
    // p-6.2 holds f-04 (start 0) and f-05 (start 100), p-4.3 holds f-13 (start 0) and f-22 (start 200)
    expect(ranked.indexOf('f-04')).toBeLessThan(ranked.indexOf('f-05'));
    expect(ranked.indexOf('f-13')).toBeLessThan(ranked.indexOf('f-22'));
  });
  it('gives every finding its own rank', () => {
    expect(new Set(model.findings.map((f) => f.docIndex)).size).toBe(findings.length);
  });
});

describe('what Next walks through', () => {
  it('severity order: all High, then all Medium, then all Low', () => {
    const sev = order('priority').map((id) => model.byId.get(id)!.severity);
    expect(sev).toEqual([...sev].sort((a, b) => ['high', 'medium', 'low'].indexOf(a) - ['high', 'medium', 'low'].indexOf(b)));
  });

  it('severity order: inside each severity the page only moves downwards', () => {
    const idx = (ids: string[]) => ids.map((id) => model.byId.get(id)!.docIndex);
    const ordered = order('priority');
    for (const sev of ['high', 'medium', 'low']) {
      const ids = ordered.filter((id) => model.byId.get(id)!.severity === sev);
      expect(idx(ids)).toEqual([...idx(ids)].sort((a, b) => a - b));
    }
  });

  it('severity order, High section: whole-document finding first, then 3.3 → 3.4 → 4.4 → 6.2 → 6.2 → 8.2 → 9.1 → 9.2', () => {
    expect(order('priority').slice(0, 9)).toEqual(['f-09', 'f-01', 'f-02', 'f-03', 'f-04', 'f-05', 'f-06', 'f-07', 'f-08']);
  });

  it('confidence no longer changes the order', () => {
    const changed = buildReviewModel(contract, { documentId: 'd', findings: findings.map((f) => ({ ...f, confidence: 1 - (f.confidence ?? 0) })) });
    const again = [...changed.findings].sort(compareForNavigation('priority')).map((f) => f.id);
    expect(again).toEqual(order('priority'));
  });

  it('document order ignores severity completely', () => {
    expect(order('document')).toEqual([...model.findings].sort((a, b) => a.docIndex - b.docIndex).map((f) => f.id));
  });
});
