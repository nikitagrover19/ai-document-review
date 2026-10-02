import { useMemo, useState } from 'react';
import { computeProgress, computeRisk } from '../store/progress';
import { useReviewStore } from '../store/reviewStore';
import { FinishReviewDialog } from './FinishReviewDialog';

export function TopBar() {
  const contract = useReviewStore((s) => s.contract);
  const meta = useReviewStore((s) => s.meta);
  const model = useReviewStore((s) => s.model);
  const decisions = useReviewStore((s) => s.decisions);
  const finishedAt = useReviewStore((s) => s.finishedAt);
  const saveStatus = useReviewStore((s) => s.saveStatus);
  const progress = useMemo(() => computeProgress(model, decisions), [model, decisions]);
  const risk = useMemo(() => computeRisk(model, decisions), [model, decisions]);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const parties = contract?.parties?.map((p) => p.name).join(' and ');
  const percent = progress.total === 0 ? 0 : Math.round((progress.decided / progress.total) * 100);
  const allDecided = progress.total > 0 && progress.pending === 0;

  return (
    <header className="topbar">
      <div>
        <h1 className="topbar__title">{contract?.title ?? 'Document review'}</h1>
        <p className="topbar__sub">
          {[parties, meta?.agent && `Reviewed by ${meta.agent.name} ${meta.agent.version}`].filter(Boolean).join(' · ') ||
            'Loading…'}
        </p>
      </div>
      {model && progress.total > 0 && (
        <div className="topbar__actions">
          {saveStatus === 'unavailable' && (
            <span className="chip chip--warn" title="This browser is not letting the app save. Your work will be lost when you leave.">
              Not saved
            </span>
          )}
          <div className="progress">
            <span id="progress-label">
              {progress.decided} of {progress.total} reviewed
            </span>
            <div
              className="progress__track"
              role="progressbar"
              aria-labelledby="progress-label"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.decided}
            >
              <div className="progress__fill" style={{ width: `${percent}%` }} />
            </div>
          </div>
          <div className="risk" title="Weighted by severity and confidence, from findings not yet decided. Falls as you accept or dismiss.">
            <span className="risk__label">Risk</span>
            <span className="risk__value">{risk}</span>
            <span className="visually-hidden"> out of 100</span>
          </div>
          {finishedAt && <span className="chip chip--accepted">Review finished</span>}
          <button
            type="button"
            // The button turns into the main call to action once nothing is left to decide.
            className={allDecided && !finishedAt ? 'button' : 'button button--secondary'}
            aria-haspopup="dialog"
            onClick={() => setSummaryOpen(true)}
          >
            {finishedAt ? 'View summary' : allDecided ? 'All reviewed: finish' : 'Finish review'}
          </button>
          <FinishReviewDialog open={summaryOpen} onClose={() => setSummaryOpen(false)} />
        </div>
      )}
    </header>
  );
}
