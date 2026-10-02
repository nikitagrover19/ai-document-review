// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from './App';
import { reviewStore } from './store/reviewStore';

function openApp(query: string) {
  window.history.pushState({}, '', `/${query}`);
  reviewStore.setState({ phase: 'idle', error: null, model: null, contract: null, meta: null });
  render(<App />);
}

beforeEach(() => cleanup());
afterEach(() => cleanup());

describe('app shell', () => {
  it('shows a loading state, then the document and progress', async () => {
    openApp('?delay=20');
    expect(screen.getByText('Loading the review…')).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
    expect((await screen.findByRole('progressbar')).getAttribute('aria-valuenow')).toBe('0');
    expect(screen.getByText(/^0 of \d+ reviewed$/)).toBeTruthy();
    expect(document.querySelectorAll('.row').length).toBeGreaterThan(0);
  });

  it('shows an error with a retry button when the service fails', async () => {
    openApp('?delay=0&fail=1');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows an empty state but keeps the document readable when there are no findings', async () => {
    openApp('?delay=0&empty=1');
    expect(await screen.findByText('Nothing to review')).toBeTruthy();
    expect(document.querySelectorAll('.row').length).toBeGreaterThan(0);
    expect(screen.queryByRole('progressbar')).toBeNull();
  });
});
