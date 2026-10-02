// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildReviewModel } from '../domain/model';
import { reviewStore } from '../store/reviewStore';
import { contract, findings, loadFixture } from '../test/fixtures';
import { DocumentView } from './DocumentView';

const card = (id: string) => document.getElementById(`finding-${id}`)!;
const open = (id: string) => fireEvent.click(within(card(id)).getAllByRole('button')[0]!);
const rowText = (row: string) => document.getElementById(`para-${row}`)!.querySelector('.row__text')!;
const applyButton = (id: string) => within(card(id)).queryByRole('button', { name: /accept & apply edit/i });

beforeEach(() => {
  loadFixture();
  // Give f-05 (which overlaps f-04 on clause 6.2) a suggestion too, so the conflict can be tested.
  reviewStore.setState({
    model: buildReviewModel(contract, {
      documentId: 'doc-1',
      findings: findings.map((f) => (f.id === 'f-05' ? { ...f, suggestedEdit: 'Vendor may use only aggregated data.' } : f)),
    }),
  });
  render(<DocumentView contract={contract} />);
});
afterEach(cleanup);

describe('applying an edit', () => {
  it('shows the replaced words struck through and the new words after them', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    const row = rowText('p-6.2');
    expect(row.querySelectorAll('ins')).toHaveLength(1);
    expect(row.querySelector('ins')!.textContent).toContain('Customer owns the deliverables.');
    expect(row.querySelector('del')!.textContent).toContain('Vendor retains all right');
  });

  it('accepts the finding and offers to revert', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    expect(reviewStore.getState().decisions['f-04']).toBe('accepted');
    expect(within(card('f-04')).getByText('Edit applied to the draft')).toBeTruthy();
    expect(within(card('f-04')).getByRole('button', { name: 'Revert edit' })).toBeTruthy();
  });

  it('never changes the contract text itself', () => {
    const before = JSON.stringify(reviewStore.getState().contract);
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    expect(JSON.stringify(reviewStore.getState().contract)).toBe(before);
  });

  it('reverting removes the redline and keeps the decision', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    fireEvent.click(within(card('f-04')).getByRole('button', { name: 'Revert edit' }));
    expect(rowText('p-6.2').querySelectorAll('ins, del')).toHaveLength(0);
    expect(reviewStore.getState().decisions['f-04']).toBe('accepted');
    expect(applyButton('f-04')).toBeTruthy();
  });

  it('moves focus to the replacement button so a keyboard user is not sent to the top of the page', () => {
    open('f-04');
    const button = applyButton('f-04')!;
    button.focus();
    fireEvent.click(button);
    expect(document.activeElement).toBe(within(card('f-04')).getByRole('button', { name: 'Revert edit' }));
  });

  it('dismissing an applied finding takes its redline out', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    act(() => reviewStore.getState().decide('f-04', 'dismissed'));
    expect(rowText('p-6.2').querySelectorAll('ins, del')).toHaveLength(0);
  });

  it('keeps applied edits on screen when a filter hides their finding', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    act(() => {
      reviewStore.getState().select(null);
      reviewStore.getState().setFilters({ statuses: ['pending'] });
    });
    expect(rowText('p-6.2').querySelectorAll('ins')).toHaveLength(1);
  });

  it('clicking the new words selects the finding that made them', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    act(() => reviewStore.getState().select(null));
    fireEvent.click(rowText('p-6.2').querySelector('ins')!);
    expect(reviewStore.getState().selection?.findingId).toBe('f-04');
  });
});

describe('conflicts and things that cannot be applied', () => {
  it('blocks an overlapping edit and says which change is in the way', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    open('f-05');
    const button = applyButton('f-05')!;
    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(within(card('f-05')).getByText(/overlaps the applied change/)).toBeTruthy();
    expect(within(card('f-05')).getByText(/Vendor owns deliverables/)).toBeTruthy();
  });

  it('unblocks it once the first edit is reverted', () => {
    open('f-04');
    fireEvent.click(applyButton('f-04')!);
    fireEvent.click(within(card('f-04')).getByRole('button', { name: 'Revert edit' }));
    open('f-05');
    expect((applyButton('f-05') as HTMLButtonElement).disabled).toBe(false);
  });

  it('offers no apply button when the agent made no suggestion', () => {
    open('f-08');
    expect(applyButton('f-08')).toBeNull();
    expect(screen.queryByText(/Applying is turned off/)).toBeNull();
  });
});
