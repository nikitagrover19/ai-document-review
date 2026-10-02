// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reviewStore } from '../store/reviewStore';
import { contract, loadFixture } from '../test/fixtures';
import { DocumentView } from './DocumentView';

const card = (id: string) => document.getElementById(`finding-${id}`)!;
const header = (id: string) => within(card(id)).getAllByRole('button')[0]!;
const open = (id: string) => fireEvent.click(header(id));
const marks = (row: string) => [...(document.getElementById(`para-${row}`)?.querySelectorAll<HTMLElement>('mark') ?? [])];

beforeEach(() => {
  loadFixture();
  render(<DocumentView contract={contract} />);
});
afterEach(cleanup);

describe('where the cards are', () => {
  it('puts each card in the row of its paragraph, most important first', () => {
    const ids = [...document.getElementById('para-p-6.2')!.querySelectorAll('article.card')].map((el) => el.id);
    expect(ids).toEqual(['finding-f-04', 'finding-f-05']);
  });

  it('shows whole-document findings in their own section', () => {
    const section = screen.getByRole('region', { name: 'About the whole document' });
    expect(within(section).getByText('Missing security clause')).toBeTruthy();
    expect(within(section).getByText('Unsure finding')).toBeTruthy();
  });

  it('labels each whole-document card itself, with no heading or explanation on screen', () => {
    const section = screen.getByRole('region', { name: 'About the whole document' });
    expect(within(section).getAllByText('Whole document').length).toBe(3);
    expect(screen.queryByText(/do not point at one passage/)).toBeNull();
    expect(section.querySelector('h2')?.className).toContain('visually-hidden');
  });

  it('keeps cards closed by default, showing severity as a word', () => {
    expect(header('f-04').getAttribute('aria-expanded')).toBe('false');
    expect(within(card('f-04')).getByText('High')).toBeTruthy();
    expect(within(card('f-04')).queryByText('Why this matters.')).toBeNull();
  });
});

describe('opening a card', () => {
  it('opens on click and shows the details', () => {
    open('f-04');
    expect(header('f-04').getAttribute('aria-expanded')).toBe('true');
    const c = within(card('f-04'));
    expect(c.getByText('Why this matters.')).toBeTruthy();
    expect(c.getByText('Liability')).toBeTruthy();
    expect(c.getByText('90% confidence')).toBeTruthy();
    expect(c.getByText(/^Suggested change/)).toBeTruthy();
    // the suggestion is shown as a redline inside its sentence: the new words are an <ins>
    expect(c.getByText('Customer owns the deliverables.').tagName).toBe('INS');
    expect(reviewStore.getState().selection).toEqual({ findingId: 'f-04', source: 'card' });
  });

  it('closes when clicked again, and only one card is open at a time', () => {
    open('f-04');
    open('f-05');
    expect(header('f-04').getAttribute('aria-expanded')).toBe('false');
    expect(header('f-05').getAttribute('aria-expanded')).toBe('true');
    open('f-05');
    expect(reviewStore.getState().selection).toBeNull();
  });

  it('highlights its text in the document', () => {
    open('f-05');
    expect(marks('p-6.2').map((m) => m.classList.contains('hl--selected'))).toEqual([false, true, true]);
  });

  it('opens when its text is clicked in the document', () => {
    fireEvent.click(marks('p-6.2')[0]!);
    expect(header('f-04').getAttribute('aria-expanded')).toBe('true');
  });

  it('flags low confidence and missing confidence', () => {
    open('f-77');
    expect(within(card('f-77')).getByText(/41% confidence · low/)).toBeTruthy();
    open('f-78');
    expect(within(card('f-78')).getByText('Confidence not given')).toBeTruthy();
  });

  it('explains an approximate location', () => {
    open('f-08');
    expect(within(card('f-08')).getAllByText(/approximate location/i).length).toBeGreaterThan(0);
  });

  it('explains missing text and shows what the agent referred to', () => {
    open('f-99');
    const c = within(card('f-99'));
    expect(c.getByText('Text not found in the document.')).toBeTruthy();
    expect(c.getByText(/THIS TEXT IS NOT IN THE DOCUMENT/)).toBeTruthy();
  });
});

describe('accepting and dismissing', () => {
  it('accepts, shows the result on the closed card too, and can be undone', () => {
    open('f-04');
    fireEvent.click(within(card('f-04')).getByRole('button', { name: 'Accept' }));
    expect(reviewStore.getState().decisions).toEqual({ 'f-04': 'accepted' });
    expect(header('f-04').getAttribute('aria-expanded')).toBe('true'); // clicking inside a card keeps it open
    fireEvent.click(within(card('f-04')).getByRole('button', { name: 'Undo' }));
    expect(reviewStore.getState().decisions).toEqual({});
    expect(within(card('f-04')).getByRole('button', { name: 'Accept' })).toBeTruthy();
  });

  it('shows the decision as a label on the collapsed card', () => {
    act(() => reviewStore.getState().decide('f-05', 'dismissed'));
    expect(within(card('f-05')).getByText('Dismissed')).toBeTruthy();
  });

  it('fades the highlight of a dismissed finding, but not while another finding still covers the text', () => {
    act(() => reviewStore.getState().decide('f-05', 'dismissed'));
    // pieces: [f-04] [f-04 + f-05] [f-05]
    expect(marks('p-6.2').map((m) => m.classList.contains('hl--dismissed'))).toEqual([false, false, true]);
  });
});

describe('notes', () => {
  const box = () => within(card('f-04')).getByPlaceholderText('Add a note…') as HTMLTextAreaElement;
  const addButton = () => within(card('f-04')).getByRole('button', { name: 'Save note' }) as HTMLButtonElement;
  // The note box stays hidden until "Add note" is pressed.
  const reveal = () => fireEvent.click(within(card('f-04')).getByRole('button', { name: 'Add note' }));

  it('hides the note box until Add note is pressed', () => {
    open('f-04');
    expect(within(card('f-04')).queryByPlaceholderText('Add a note…')).toBeNull();
    reveal();
    expect(box()).toBeTruthy();
  });

  it('cannot add an empty note', () => {
    open('f-04');
    reveal();
    expect(addButton().disabled).toBe(true);
    fireEvent.change(box(), { target: { value: '   ' } });
    expect(addButton().disabled).toBe(true);
  });

  it('adds a note, hides the box again and shows the count when closed', () => {
    open('f-04');
    reveal();
    fireEvent.change(box(), { target: { value: 'Ask legal about this.' } });
    fireEvent.click(addButton());
    expect(within(card('f-04')).getByText('Ask legal about this.')).toBeTruthy();
    expect(within(card('f-04')).queryByPlaceholderText('Add a note…')).toBeNull();
    open('f-04');
    expect(within(card('f-04')).getByText('1 comment')).toBeTruthy();
  });

  it('adds with Cmd/Ctrl + Enter', () => {
    open('f-04');
    reveal();
    fireEvent.change(box(), { target: { value: 'Quick note' } });
    fireEvent.keyDown(box(), { key: 'Enter', ctrlKey: true });
    expect(reviewStore.getState().comments['f-04']).toHaveLength(1);
  });

  it('a note alone does not count as a decision', () => {
    open('f-04');
    reveal();
    fireEvent.change(box(), { target: { value: 'Note' } });
    fireEvent.click(addButton());
    expect(reviewStore.getState().decisions).toEqual({});
  });

  it('keeps a half-typed note when the card is closed and opened again', () => {
    open('f-04');
    reveal();
    fireEvent.change(box(), { target: { value: 'Half written' } });
    open('f-04'); // close
    open('f-04'); // open
    expect(box().value).toBe('Half written');
  });

  it('Escape inside the note box does not close the card', () => {
    open('f-04');
    reveal();
    fireEvent.keyDown(box(), { key: 'Escape' });
    expect(reviewStore.getState().selection?.findingId).toBe('f-04');
  });
});
