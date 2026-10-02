import { useEffect, useMemo, useRef, useState } from 'react';
import { buildSummary, summaryToMarkdown, type SummaryItem } from '../domain/summary';
import type { ReviewStatus } from '../domain/types';
import { useReviewStore } from '../store/reviewStore';
import { SeverityBadge } from './SeverityBadge';

const GROUP_TITLE: Record<ReviewStatus, string> = {
  pending: 'Not yet decided',
  accepted: 'Accepted',
  dismissed: 'Dismissed',
};

function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  // Revoking in the same tick can cancel the download in some Safari versions: let it start first.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Item({ item, onShow }: { item: SummaryItem; onShow: (id: string) => void }) {
  return (
    <li className="summary__item">
      <div className="summary__item-head">
        <SeverityBadge severity={item.finding.severity} />
        <span className="summary__item-title">{item.finding.title}</span>
        <button
          type="button"
          className="button button--ghost"
          aria-label={`Show ${item.finding.title} in the document`}
          onClick={() => onShow(item.finding.id)}
        >
          Show
        </button>
      </div>
      <p className="summary__item-meta">
        {item.finding.category} · {item.location}
        {item.applied && <span className="chip chip--applied summary__applied">Edit applied</span>}
      </p>
      {item.comments.length > 0 && (
        <ul className="summary__comments" aria-label="Your comments">
          {item.comments.map((c) => (
            <li key={c.id}>{c.text}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * The "Finish review" screen: where things stand, what is still undecided, and what was decided.
 * A native <dialog> opened with showModal() gives us the focus trap, Escape to close,
 * an inert page behind it, and focus returning to the button that opened it.
 */
export function FinishReviewDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  const model = useReviewStore((s) => s.model);
  const contract = useReviewStore((s) => s.contract);
  const meta = useReviewStore((s) => s.meta);
  const decisions = useReviewStore((s) => s.decisions);
  const comments = useReviewStore((s) => s.comments);
  const applied = useReviewStore((s) => s.applied);
  const finishedAt = useReviewStore((s) => s.finishedAt);
  const saveStatus = useReviewStore((s) => s.saveStatus);
  const finish = useReviewStore((s) => s.finish);
  const reopen = useReviewStore((s) => s.reopen);
  const reset = useReviewStore((s) => s.reset);
  const select = useReviewStore((s) => s.select);

  // Only build the summary while the dialog is open.
  const summary = useMemo(
    () => (open ? buildSummary(model, contract, decisions, comments, applied) : null),
    [open, model, contract, decisions, comments, applied],
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', ''); // very old browsers and test environments
    } else if (!open && el.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
    }
    if (!open) setConfirmingReset(false);
  }, [open]);

  const show = (id: string) => {
    onClose();
    select(id, 'nav');
  };

  const counts = summary && {
    accepted: summary.groups.accepted.length,
    dismissed: summary.groups.dismissed.length,
    pending: summary.groups.pending.length,
  };
  const highPending = summary?.pendingBySeverity.high ?? 0;

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="summary-title"
      onClose={onClose}
      onClick={(e) => {
        // a click on the dimmed backdrop lands on the <dialog> itself
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {open && summary && counts && (
        <div className="dialog__panel">
          <header className="dialog__header">
            <h2 id="summary-title">Review summary</h2>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Close<span className="visually-hidden"> summary</span>
            </button>
          </header>

          <div className="dialog__body">
            {finishedAt && (
              <p className="notice notice--ok" role="status">
                <strong>Review finished</strong> on {new Date(finishedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
              </p>
            )}

            {summary.appliedCount > 0 && (
              <p className="notice" role="note">
                {summary.appliedCount} suggested {summary.appliedCount === 1 ? 'edit is' : 'edits are'} applied to the draft. The original
                document is unchanged; the download lists each revised clause.
              </p>
            )}

            <dl className="stats">
              {(['accepted', 'dismissed', 'pending'] as const).map((status) => (
                <div key={status} className={`stats__tile stats__tile--${status}`}>
                  <dt>{GROUP_TITLE[status]}</dt>
                  <dd>{counts[status]}</dd>
                </div>
              ))}
            </dl>

            {counts.pending > 0 && !finishedAt && (
              <p className="notice" role="note">
                <strong>
                  {counts.pending} {counts.pending === 1 ? 'finding has' : 'findings have'} no decision yet
                </strong>
                {highPending > 0 && `, including ${highPending} high severity`}. You can finish anyway; they will be listed as undecided.
              </p>
            )}
            {counts.pending === 0 && !finishedAt && summary.total > 0 && (
              <p className="notice notice--ok" role="note">
                Every finding has a decision. Nothing is left to review.
              </p>
            )}

            {(['pending', 'accepted', 'dismissed'] as const).map((status) => {
              const items = summary.groups[status];
              if (items.length === 0) return null;
              return (
                <section key={status} className="summary__group" aria-label={`${GROUP_TITLE[status]}, ${items.length}`}>
                  <h3>
                    {GROUP_TITLE[status]} <span className="summary__count">{items.length}</span>
                  </h3>
                  <ul className="summary__list">
                    {items.map((item) => (
                      <Item key={item.finding.id} item={item} onShow={show} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <footer className="dialog__footer">
            {confirmingReset ? (
              <div className="dialog__confirm" role="alertdialog" aria-label="Confirm reset">
                <span>This clears every decision and comment. It cannot be undone.</span>
                <button
                  type="button"
                  className="button button--danger"
                  onClick={() => {
                    reset();
                    setConfirmingReset(false);
                  }}
                >
                  Yes, reset everything
                </button>
                <button type="button" className="button button--secondary" onClick={() => setConfirmingReset(false)}>
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <div className="dialog__footer-left">
                  <button type="button" className="button button--ghost button--danger-text" onClick={() => setConfirmingReset(true)}>
                    Reset review…
                  </button>
                  <span className="dialog__save-note">
                    {saveStatus === 'unavailable'
                      ? 'This browser cannot save your work. Download the summary before you leave.'
                      : 'Saved in this browser'}
                  </span>
                </div>
                <div className="dialog__footer-right">
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() =>
                      downloadText(
                        'review-summary.md',
                        summaryToMarkdown(summary, { title: contract?.title ?? 'Document', agent: meta?.agent, finishedAt }),
                      )
                    }
                  >
                    Download summary
                  </button>
                  {finishedAt ? (
                    <button type="button" className="button" onClick={reopen}>
                      Reopen review
                    </button>
                  ) : (
                    <button type="button" className="button" onClick={finish}>
                      Finish review
                    </button>
                  )}
                </div>
              </>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}
