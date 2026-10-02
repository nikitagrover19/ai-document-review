// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewStore } from '../store/reviewStore';
import { P_6_2, P_9_2, contract, loadFixture } from '../test/fixtures';
import { DocumentView } from './DocumentView';

const selected = () => reviewStore.getState().selection;
// ids contain a dot (p-6.2), so look the row up by id instead of using a CSS selector
const marks = (row: string) => [...(document.getElementById(`para-${row}`)?.querySelectorAll<HTMLElement>('mark') ?? [])];

beforeEach(() => {
  loadFixture();
  render(<DocumentView contract={contract} />);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('highlights', () => {
  it('cuts the overlap into three pieces and badges the shared one', () => {
    const m = marks('p-6.2');
    expect(m.map((el) => el.dataset.findingIds)).toEqual(['f-04', 'f-04 f-05', 'f-05']);
    expect(m.map((el) => el.dataset.more)).toEqual([undefined, '1', undefined]);
    expect(m[1]!.textContent).toBe(P_6_2.slice(167, 227));
  });

  it('never adds or loses a character of the contract text', () => {
    expect(document.getElementById('para-p-6.2')!.querySelector('.row__text')!.textContent).toBe(P_6_2);
    expect(document.getElementById('para-p-9.2')!.querySelector('.row__text')!.textContent).toBe(P_9_2);
  });

  it('marks a repaired anchor as approximate, at the right words', () => {
    const [m] = marks('p-9.2');
    expect(m!.textContent).toBe('SHALL NOT EXCEED THE FEES PAID BY CUSTOMER');
    expect(m!.classList.contains('hl--approx')).toBe(true);
    expect(marks('p-6.2')[0]!.classList.contains('hl--approx')).toBe(false);
  });

  it('does not highlight an unresolved anchor', () => {
    expect(marks('p-9.2')).toHaveLength(1); // only the repaired f-08
    expect(marks('p-9.2').some((el) => el.dataset.findingIds?.includes('f-99'))).toBe(false);
  });
});

describe('selecting by clicking the text', () => {
  it('selects the most important finding and records that the document was clicked', () => {
    fireEvent.click(marks('p-6.2')[0]!);
    expect(selected()).toEqual({ findingId: 'f-04', source: 'document' });
  });

  it('steps through overlapping findings on repeated clicks', () => {
    const overlap = marks('p-6.2')[1]!;
    fireEvent.click(overlap);
    expect(selected()!.findingId).toBe('f-04');
    fireEvent.click(overlap);
    expect(selected()!.findingId).toBe('f-05');
    fireEvent.click(overlap);
    expect(selected()!.findingId).toBe('f-04');
  });

  it('shows the selected state on every piece of that finding, including the shared one', () => {
    fireEvent.click(marks('p-6.2')[2]!); // only f-05 here
    expect(marks('p-6.2').map((el) => el.classList.contains('hl--selected'))).toEqual([false, true, true]);
  });

  it('leaves other paragraphs unmarked when a finding is selected', () => {
    fireEvent.click(marks('p-6.2')[0]!);
    expect(marks('p-9.2').some((el) => el.classList.contains('hl--selected'))).toBe(false);
  });

  it('clears the selection when plain text or Escape is used', () => {
    fireEvent.click(marks('p-6.2')[0]!);
    fireEvent.click(document.getElementById('para-p-9.2')!.querySelector('.row__text')!);
    expect(selected()).toBeNull();

    fireEvent.click(marks('p-6.2')[0]!);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(selected()).toBeNull();
  });

  it('ignores the click when the reviewer was selecting text to copy it', () => {
    vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'some copied words' } as Selection);
    fireEvent.click(marks('p-6.2')[0]!);
    expect(selected()).toBeNull();
  });
});
