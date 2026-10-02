// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reviewStore } from '../store/reviewStore';
import { loadFixture } from '../test/fixtures';
import { TopBar } from './TopBar';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
  loadFixture();
  render(<TopBar />);
  reviewStore.setState({ meta: { documentId: 'doc-1', agent: { name: 'Agent', version: '1' }, generatedAt: undefined } });
});
afterEach(cleanup);

const openSummary = () => fireEvent.click(screen.getByRole('button', { name: 'Finish review' }));
const dialog = () => document.querySelector('dialog')!;

describe('Finish review', () => {
  it('opens a summary with counts and a warning about undecided findings', () => {
    openSummary();
    const d = within(dialog());
    expect(d.getByRole('heading', { name: 'Review summary' })).toBeTruthy();
    expect(d.getByText(/7 findings have no decision yet/)).toBeTruthy();
    expect(d.getByText(/including 3 high severity/)).toBeTruthy();
  });

  it('lets the reviewer finish anyway, and shows it', () => {
    openSummary();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Finish review' }));
    expect(reviewStore.getState().finishedAt).not.toBeNull();
    expect(within(dialog()).getByText('Review finished')).toBeTruthy();
    expect(within(dialog()).getByRole('button', { name: 'Reopen review' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'View summary' })).toBeTruthy();
  });

  it('turns into the main action once everything is decided', () => {
    act(() => {
      for (const id of reviewStore.getState().model!.findings.map((f) => f.id)) reviewStore.getState().decide(id, 'accepted');
    });
    expect(screen.getByRole('button', { name: 'All reviewed: finish' })).toBeTruthy();
  });

  it('"Show" closes the summary and selects that finding', () => {
    openSummary();
    fireEvent.click(within(dialog()).getByRole('button', { name: /Show Missing security clause/ }));
    expect(reviewStore.getState().selection).toEqual({ findingId: 'f-09', source: 'nav' });
    expect(dialog().hasAttribute('open')).toBe(false);
  });

  it('asks before resetting, and Cancel changes nothing', () => {
    act(() => reviewStore.getState().decide('f-04', 'accepted'));
    openSummary();
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset review…' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }));
    expect(reviewStore.getState().decisions).toEqual({ 'f-04': 'accepted' });
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Reset review…' }));
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Yes, reset everything' }));
    expect(reviewStore.getState().decisions).toEqual({});
  });

  it('warns when the browser cannot save', () => {
    act(() => reviewStore.setState({ saveStatus: 'unavailable' }));
    expect(screen.getByText('Not saved')).toBeTruthy();
  });
});
