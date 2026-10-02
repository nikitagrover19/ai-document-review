// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './../App';
import { reviewStore } from '../store/reviewStore';
import { loadFixture } from '../test/fixtures';

const card = (id: string) => document.getElementById(`finding-${id}`)!;
const live = { get textContent() { return (document.querySelector('[aria-live="polite"].visually-hidden')!.textContent ?? '').replace(/\u200B/g, ''); } };
const press = (key: string, init: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key, ...init });

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  // App only loads when idle; the fixture is already "ready", so it just renders.
  loadFixture();
  render(<App />);
});
afterEach(cleanup);

describe('keyboard shortcuts', () => {
  it('j opens the first finding (High first) and moves focus to its card', () => {
    press('j');
    const sel = reviewStore.getState().selection;
    expect(sel?.source).toBe('key');
    expect(sel && reviewStore.getState().model?.byId.get(sel.findingId)?.severity).toBe('high');
    expect(document.activeElement).toBe(within(card(sel!.findingId)).getAllByRole('button')[0]);
  });

  it('a accepts and d dismisses the open finding; u undoes', () => {
    press('j');
    const id = reviewStore.getState().selection!.findingId;
    press('a');
    expect(reviewStore.getState().decisions[id]).toBe('accepted');
    press('d');
    expect(reviewStore.getState().decisions[id]).toBe('dismissed');
    press('u');
    expect(reviewStore.getState().decisions[id]).toBeUndefined();
  });

  it('does nothing to decisions when no finding is open', () => {
    press('a');
    expect(reviewStore.getState().decisions).toEqual({});
  });

  it('is ignored while typing a comment', () => {
    press('j');
    const id = reviewStore.getState().selection!.findingId;
    fireEvent.click(within(card(id)).getByRole('button', { name: 'Add note' }));
    const box = within(card(id)).getByPlaceholderText('Add a note…');
    fireEvent.keyDown(box, { key: 'a' });
    expect(reviewStore.getState().decisions).toEqual({});
  });

  it('is ignored with Ctrl or Cmd held', () => {
    press('j', { metaKey: true });
    expect(reviewStore.getState().selection).toBeNull();
  });
});

describe('focus', () => {
  it('after Accept is clicked, focus lands on Undo instead of falling back to the page', () => {
    press('j');
    const id = reviewStore.getState().selection!.findingId;
    const accept = within(card(id)).getByRole('button', { name: 'Accept' });
    accept.focus();
    fireEvent.click(accept);
    expect(document.activeElement).toBe(within(card(id)).getByRole('button', { name: 'Undo' }));
  });

  it('after Undo, focus returns to Accept', () => {
    press('j');
    const id = reviewStore.getState().selection!.findingId;
    press('a');
    const undo = within(card(id)).getByRole('button', { name: 'Undo' });
    undo.focus();
    fireEvent.click(undo);
    expect(document.activeElement).toBe(within(card(id)).getByRole('button', { name: 'Accept' }));
  });

  it('the skip link target can take focus', () => {
    expect(document.getElementById('document')!.tabIndex).toBe(-1);
  });
});

describe('announcements', () => {
  it('the Next button announces which finding is open and where it is in the list', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Next unresolved' }));
    expect(live.textContent).toMatch(/^Finding 1 of 7: High severity\./);
  });

  it('a decision is confirmed with the new progress', () => {
    press('j');
    press('a');
    expect(live.textContent).toMatch(/^Accepted: .+\. 1 of 7 reviewed\.$/);
    press('u');
    expect(live.textContent).toMatch(/^Decision undone for: .+\. 0 of 7 reviewed\.$/);
  });

  it('a reset is announced as a reset, not as one undone decision', () => {
    act(() => {
      reviewStore.getState().decide('f-04', 'accepted');
      reviewStore.getState().decide('f-05', 'dismissed');
      reviewStore.getState().reset();
    });
    expect(live.textContent).toMatch(/^Review reset\./);
  });

  it('shortcut navigation is not announced (focus moves to the card instead)', () => {
    press('j');
    expect(live.textContent).toBe('');
  });
});

describe('filters on narrow screens', () => {
  it('has a Filters button that reports open/closed and the number of active filters', () => {
    const toggle = screen.getByRole('button', { name: /^Filters/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    act(() => reviewStore.getState().setFilters({ severities: ['high'], statuses: ['pending'] }));
    expect(screen.getByRole('button', { name: 'Filters · 2' })).toBeTruthy();
  });
});

describe('shortcut legend', () => {
  it('lists every shortcut', () => {
    const legend = screen.getByRole('group', { name: 'Keyboard shortcuts' });
    for (const k of ['j', 'k', 'a', 'd', 'u']) expect(within(legend).getByText(k)).toBeTruthy();
  });
});
