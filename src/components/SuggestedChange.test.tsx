// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import contractJson from '../../data/sample-contract.json';
import findingsJson from '../../data/findings.json';
import { buildReviewModel } from '../domain/model';
import type { Contract, FindingsFile, ResolvedFinding } from '../domain/types';
import { reviewStore } from '../store/reviewStore';
import { SuggestedChange } from './SuggestedChange';

const contract = contractJson as unknown as Contract;
const model = buildReviewModel(contract, findingsJson as unknown as FindingsFile);
const finding = (id: string) => model.byId.get(id)!;
const show = (f: ResolvedFinding) => render(<SuggestedChange finding={f} />);

beforeEach(() => {
  reviewStore.setState({ phase: 'ready', contract, model });
});
afterEach(cleanup);

describe('SuggestedChange', () => {
  it('marks removed words as <del> and added words as <ins>, inside the full sentence', () => {
    const { container } = show(finding('f-08'));
    expect(screen.getByText('Suggested change · Clause 9.2')).toBeTruthy();
    expect(container.querySelector('del')?.textContent).toContain('ONE (1) MONTH');
    const added = [...container.querySelectorAll('ins')].map((el) => el.textContent);
    expect(added.some((t) => t?.includes('OR PAYABLE'))).toBe(true);
    expect(added.some((t) => t?.includes('TWELVE (12) MONTHS'))).toBe(true);
    // the words around the change are there too: that is the point of the full-sentence view
    expect(container.textContent).toContain('VENDOR’S TOTAL CUMULATIVE LIABILITY');
    expect(container.textContent).toContain('GIVING RISE TO THE CLAIM.');
  });

  it('is not colour alone: a screen reader hears what was removed and what was added', () => {
    const { container } = show(finding('f-08'));
    expect(container.querySelector('del .visually-hidden')?.textContent).toBe('Removed: ');
    expect(container.querySelector('ins .visually-hidden')?.textContent).toBe('Added: ');
  });

  it('is a redline only: there is no view switch', () => {
    show(finding('f-08'));
    expect(screen.queryByRole('group', { name: 'How to show the change' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Result' })).toBeNull();
  });

  it('says plainly when a change runs across two clauses and can only be previewed (f-02)', () => {
    const { container } = show(finding('f-02'));
    expect(screen.getByText('Suggested change · Clauses 3.4–3.5')).toBeTruthy();
    expect(screen.getByText(/can only be previewed/)).toBeTruthy();
    expect(container.querySelector('.edit__break')).toBeTruthy();
  });

  it('warns about a bad join (f-14: doubled comma)', () => {
    show(finding('f-14'));
    expect(screen.getByText('Check the join.')).toBeTruthy();
    expect(screen.getByText(/punctuation would be doubled/)).toBeTruthy();
  });

  it('shows no warning when the join is fine (f-08)', () => {
    show(finding('f-08'));
    expect(screen.queryByText('Check the join.')).toBeNull();
  });

  it('shows only the replaced words, with a reason, when the location is approximate (f-20)', () => {
    const { container } = show(finding('f-20'));
    expect(screen.getByText(/location is approximate/)).toBeTruthy();
    expect(container.querySelector('del')?.textContent).toContain('labor shortages');
    expect(screen.getByText('Suggested change')).toBeTruthy(); // no "· Clause" claim for an approximate place
  });

  it('falls back to the plain suggestion, with a reason, when the quoted text was not found', () => {
    show({ ...finding('f-08'), anchorStatus: 'unresolved', spans: [], suggestedEdit: 'Replace it with this.' });
    expect(screen.getByText('Replace it with this.')).toBeTruthy();
    expect(screen.getByText(/cannot be shown against the document/)).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'How to show the change' })).toBeNull();
  });

  it('renders nothing when there is no suggested change', () => {
    const { container } = show(finding('f-10'));
    expect(container.textContent).toBe('');
  });

  it('never changes the document: the contract text is untouched after previewing', () => {
    const before = JSON.stringify(contract);
    show(finding('f-08'));
    show(finding('f-02'));
    expect(JSON.stringify(contract)).toBe(before);
  });
});
