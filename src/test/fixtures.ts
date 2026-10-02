import { NO_FILTERS } from '../domain/filters';
import { buildReviewModel } from '../domain/model';
import type { Contract } from '../domain/types';
import { reviewStore } from '../store/reviewStore';

// Real paragraphs from the assignment (curly quotes kept).
export const P_6_2 =
  'Vendor retains all right, title, and interest in and to the Deliverables, its pre-existing materials, and any improvements, enhancements, or derivative works thereof, including any models or insights derived from Customer Data. Vendor may use aggregated and anonymized data derived from Customer Data for any purpose, including to improve and market its products and services.';
export const P_9_2 =
  'VENDOR’S TOTAL CUMULATIVE LIABILITY ARISING OUT OF OR RELATING TO THIS AGREEMENT SHALL NOT EXCEED THE FEES PAID BY CUSTOMER TO VENDOR IN THE ONE (1) MONTH PRECEDING THE EVENT GIVING RISE TO THE CLAIM. THE FOREGOING LIMITATIONS SHALL NOT APPLY TO CUSTOMER’S PAYMENT OBLIGATIONS OR CUSTOMER’S INDEMNIFICATION OBLIGATIONS UNDER SECTION 8.2.';

export const contract: Contract = {
  id: 'doc-1',
  title: 'Test',
  sections: [
    { id: 's-6', number: '6', heading: 'IP', paragraphs: [{ id: 'p-6.2', number: '6.2', text: P_6_2 }] },
    { id: 's-9', number: '9', heading: 'Liability', paragraphs: [{ id: 'p-9.2', number: '9.2', text: P_9_2 }] },
  ],
};

const base = { category: 'Liability', explanation: 'Why this matters.', suggestedEdit: null, confidence: 0.9 };

export const findings = [
  // overlapping pair in p-6.2
  { ...base, id: 'f-04', severity: 'high', title: 'Vendor owns deliverables', suggestedEdit: 'Customer owns the deliverables.', anchor: { paragraphId: 'p-6.2', start: 0, end: 227, quote: P_6_2.slice(0, 227) } },
  { ...base, id: 'f-05', severity: 'high', title: 'Derived data', confidence: 0.79, anchor: { paragraphId: 'p-6.2', start: 167, end: 376, quote: P_6_2.slice(167, 376) } },
  // wrong offsets: repaired
  { ...base, id: 'f-08', severity: 'medium', title: 'Liability cap', anchor: { paragraphId: 'p-9.2', start: 5, end: 40, quote: 'SHALL NOT EXCEED THE FEES PAID BY CUSTOMER' } },
  // quote is not in the document: unresolved, never highlighted
  { ...base, id: 'f-99', severity: 'low', title: 'Ghost', anchor: { paragraphId: 'p-9.2', start: 0, end: 10, quote: 'THIS TEXT IS NOT IN THE DOCUMENT' } },
  // about the whole document
  { ...base, id: 'f-09', severity: 'high', category: 'Data Protection', title: 'Missing security clause', confidence: 0.87, anchor: null },
  { ...base, id: 'f-77', severity: 'low', category: 'Governance', title: 'Unsure finding', confidence: 0.41, anchor: null },
  { ...base, id: 'f-78', severity: 'low', title: 'No confidence given', confidence: undefined, anchor: null },
];

/** Put the fixture into the app's store, as if it had just loaded. */
export function loadFixture() {
  reviewStore.setState({
    phase: 'ready',
    contract,
    model: buildReviewModel(contract, { documentId: 'doc-1', findings }),
    selection: null,
    decisions: {},
    comments: {},
    applied: [],
    drafts: {},
    finishedAt: null,
    filters: NO_FILTERS,
    navOrder: 'priority',
  });
}
