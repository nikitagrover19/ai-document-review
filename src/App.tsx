import { useEffect, useRef } from 'react';
import { Announcer } from './components/Announcer';
import { DataIssuesBanner } from './components/DataIssuesBanner';
import { DocumentView } from './components/DocumentView';
import { FilterBar } from './components/FilterBar';
import { MiniMap } from './components/MiniMap';
import { EmptyFindingsState, ErrorState, LoadingState } from './components/states';
import { TopBar } from './components/TopBar';
import { shortcutFor } from './lib/shortcuts';
import { reviewStore, useReviewStore } from './store/reviewStore';

export default function App() {
  const phase = useReviewStore((s) => s.phase);
  const error = useReviewStore((s) => s.error);
  const contract = useReviewStore((s) => s.contract);
  const hasFindings = useReviewStore((s) => (s.model?.findings.length ?? 0) > 0);
  const load = useReviewStore((s) => s.load);

  useEffect(() => {
    if (reviewStore.getState().phase === 'idle') void load();
  }, [load]);

  // Keyboard shortcuts (j / k / a / d / u). See lib/shortcuts.ts for when they are ignored.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = shortcutFor(event);
      if (!action) return;
      const state = reviewStore.getState();
      if (state.phase !== 'ready' || !state.model || state.model.findings.length === 0) return;
      event.preventDefault();
      if (action === 'next') return state.step(1, 'key');
      if (action === 'previous') return state.step(-1, 'key');
      const id = state.selection?.findingId;
      if (!id) return; // decisions apply to the open finding only
      if (action === 'undo') return state.decide(id, null);
      const decision = action === 'accept' ? 'accepted' : 'dismissed';
      if (state.decisions[id] !== decision) state.decide(id, decision);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  // The top bar and filter bar stay fixed at the top. Tell the page how tall they are,
  // so scrolling to a finding stops just below them instead of underneath.
  const chromeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = chromeRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const update = () => document.documentElement.style.setProperty('--chrome-height', `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <a className="skip-link" href="#document">
        Skip to document
      </a>
      <Announcer />
      <div className="chrome" ref={chromeRef}>
        <TopBar />
        {phase === 'ready' && hasFindings && <FilterBar />}
      </div>
      <main className="page">
        {(phase === 'idle' || phase === 'loading') && <LoadingState />}
        {phase === 'error' && <ErrorState message={error ?? 'Something went wrong.'} onRetry={() => void load()} />}
        {phase === 'ready' && contract && (
          <>
            <DataIssuesBanner />
            {!hasFindings && <EmptyFindingsState />}
            <DocumentView contract={contract} />
          </>
        )}
      </main>
      {phase === 'ready' && hasFindings && <MiniMap />}
    </>
  );
}
