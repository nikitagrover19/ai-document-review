// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewStore } from '../store/reviewStore';
import { contract, loadFixture } from '../test/fixtures';
import { DocumentView } from './DocumentView';
import { FilterBar } from './FilterBar';
import { MiniMap } from './MiniMap';

const scrollIntoView = vi.fn();
const card = (id: string) => document.getElementById(`finding-${id}`);
const marks = (row: string) => [...(document.getElementById(`para-${row}`)?.querySelectorAll<HTMLElement>('mark') ?? [])];
// only look inside the filter bar: cards and mini-map ticks also say "High", "Low" ...
const bar = () => within(screen.getByRole('region', { name: 'Filter and navigate findings' }));
const chip = (name: RegExp) => {
  const matches = bar().getAllByRole('button', { name })
    .filter((b) => !b.classList.contains('strip__item'));
  if (matches.length !== 1) throw new Error(`Expected 1 chip for ${name}, got ${matches.length}`);
  return matches[0]!;
};

beforeEach(() => {
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
  loadFixture();
  render(
    <>
      <FilterBar />
      <DocumentView contract={contract} />
      <MiniMap />
    </>,
  );
});
afterEach(cleanup);

describe('counts', () => {
  it('shows counts by severity and status, and how many are shown', () => {
    expect(chip(/^High, 3 findings$/)).toBeTruthy();
    expect(chip(/^Medium, 1 finding$/)).toBeTruthy();
    expect(chip(/^Low, 3 findings$/)).toBeTruthy();
    expect(chip(/^Pending, 7 findings$/)).toBeTruthy();
    expect(screen.getByText('Showing 7 of 7')).toBeTruthy();
    expect(screen.getByText('7 unresolved')).toBeTruthy();
  });

  it('updates the status counts as findings are decided', () => {
    act(() => reviewStore.getState().decide('f-04', 'accepted'));
    expect(chip(/^Pending, 6 findings$/)).toBeTruthy();
    expect(chip(/^Accepted, 1 finding$/)).toBeTruthy();
    expect(screen.getByText('6 unresolved')).toBeTruthy();
  });
});

describe('filtering', () => {
  it('hides cards and highlights of findings that do not match', () => {
    fireEvent.click(chip(/^High/));
    expect(chip(/^High/).getAttribute('aria-pressed')).toBe('true');
    expect(card('f-04')).toBeTruthy();
    expect(card('f-08')).toBeNull();
    expect(marks('p-9.2')).toHaveLength(0); // the medium finding's highlight is gone too
    expect(marks('p-6.2').length).toBeGreaterThan(0);
    expect(screen.getByText('Showing 3 of 7')).toBeTruthy();
  });

  it('combines groups: high AND Data Protection', () => {
    fireEvent.click(chip(/^High/));
    fireEvent.click(bar().getByText('Category'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Data Protection, 1 finding' }));
    expect(card('f-09')).toBeTruthy();
    expect(card('f-04')).toBeNull();
    expect(screen.getByText('Showing 1 of 7')).toBeTruthy();
  });

  it('says so when nothing matches, and clears with one click', () => {
    fireEvent.click(chip(/^Accepted/));
    expect(screen.getByText('No findings match these filters.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(screen.getByText('Showing 7 of 7')).toBeTruthy();
  });

  it('keeps the finding you just accepted on screen (so Undo stays reachable) until you move on', () => {
    fireEvent.click(chip(/^Pending/));
    fireEvent.click(within(card('f-04')!).getAllByRole('button')[0]!);
    fireEvent.click(within(card('f-04')!).getByRole('button', { name: 'Accept' }));
    expect(card('f-04')).toBeTruthy();
    fireEvent.click(chip(/^Next unresolved$/));
    expect(card('f-04')).toBeNull();
    expect(reviewStore.getState().selection?.findingId).toBe('f-05'); // the next High after f-04, top to bottom
  });
});

describe('Previous / Next unresolved', () => {
  it('opens the first High finding and scrolls its row to the top', () => {
    fireEvent.click(chip(/^Next unresolved$/));
    expect(reviewStore.getState().selection).toEqual({ findingId: 'f-09', source: 'nav' });
    expect(within(card('f-09')!).getAllByRole('button')[0]!.getAttribute('aria-expanded')).toBe('true');
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'start' }));
  });

  it('stays inside one severity before moving to the next one', () => {
    const visited: string[] = [];
    for (let i = 0; i < 4; i++) {
      fireEvent.click(chip(/^Next unresolved$/));
      visited.push(reviewStore.getState().selection!.findingId);
    }
    expect(visited).toEqual(['f-09', 'f-04', 'f-05', 'f-08']); // three High findings top to bottom, then the Medium one
  });

  it('can follow plain document order instead', () => {
    fireEvent.click(chip(/^Document order$/));
    expect(chip(/^Document order$/).getAttribute('aria-pressed')).toBe('true');
    expect(chip(/^Severity$/).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(chip(/^Next unresolved$/));
    fireEvent.click(chip(/^Next unresolved$/));
    expect(reviewStore.getState().selection?.findingId).toBe('f-77'); // a Low one, because it is next in the text
  });

  it('is disabled when everything is decided', () => {
    act(() => {
      for (const id of ['f-04', 'f-09', 'f-05', 'f-08', 'f-99', 'f-77', 'f-78']) reviewStore.getState().decide(id, 'dismissed');
    });
    expect((chip(/^Next unresolved$/) as HTMLButtonElement).disabled).toBe(true);
    expect((chip(/^Previous$/) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('scrolling after a click', () => {
  it('only makes the card fully visible when the text is clicked', () => {
    fireEvent.click(marks('p-6.2')[0]!);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  });

  it('only makes the text visible when the card is clicked', () => {
    fireEvent.click(within(card('f-04')!).getAllByRole('button')[0]!);
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  });
});

describe('mini-map', () => {
  const nav = () => screen.getByRole('navigation', { name: 'Findings overview' });

  it('has one tick per visible finding, labelled with severity and title', () => {
    expect(within(nav()).getAllByRole('button')).toHaveLength(7);
    expect(within(nav()).getByRole('button', { name: 'High severity: Vendor owns deliverables' })).toBeTruthy();
  });

  it('follows the filters', () => {
    fireEvent.click(chip(/^Low/));
    expect(within(nav()).getAllByRole('button')).toHaveLength(3);
  });

  it('jumps to a finding when a tick is clicked', () => {
    fireEvent.click(within(nav()).getByRole('button', { name: /Liability cap/ }));
    expect(reviewStore.getState().selection).toEqual({ findingId: 'f-08', source: 'nav' });
  });

  it('fades the ticks of decided findings', () => {
    act(() => reviewStore.getState().decide('f-04', 'accepted'));
    const tick = within(nav()).getByRole('button', { name: /Vendor owns deliverables/ });
    expect(tick.classList.contains('minimap__tick--decided')).toBe(true);
  });
});
