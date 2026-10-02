import { memo, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import type { ResolvedFinding } from '../domain/types';
import { SHORTCUTS, type ShortcutAction } from '../lib/shortcuts';
import { useReviewStore } from '../store/reviewStore';
import { ApplyEdit } from './ApplyEdit';
import { SeverityBadge } from './SeverityBadge';
import { SuggestedChange } from './SuggestedChange';

/** Below this the agent itself is unsure, so we say so. */
export const LOW_CONFIDENCE = 0.6;

function Confidence({ value }: { value: number | null }) {
  if (value === null) return <span className="card__meta-item">Confidence not given</span>;
  const low = value < LOW_CONFIDENCE;
  return (
    <span className={low ? 'card__meta-item card__meta-item--low' : 'card__meta-item'}>
      {Math.round(value * 100)}% confidence{low && ' · low'}
    </span>
  );
}

function AnchorNotice({ finding }: { finding: ResolvedFinding }) {
  if (finding.anchorStatus === 'repaired') {
    return (
      <div className="notice">
        <strong>Approximate location.</strong> {finding.anchorNote}
      </div>
    );
  }
  if (finding.anchorStatus === 'unresolved') {
    return (
      <div className="notice">
        <strong>Text not found in the document.</strong> {finding.anchorNote}
        {finding.anchor?.quote && (
          <blockquote className="notice__quote">
            <span className="visually-hidden">The agent referred to: </span>
            {finding.anchor.quote}
          </blockquote>
        )}
      </div>
    );
  }
  return null;
}

function Comments({ findingId }: { findingId: string }) {
  const comments = useReviewStore((s) => s.comments[findingId]);
  const draft = useReviewStore((s) => s.drafts[findingId] ?? '');
  const setDraft = useReviewStore((s) => s.setDraft);
  const addComment = useReviewStore((s) => s.addComment);
  const inputId = useId();
  // The box stays hidden behind "Add note" until it is wanted; a half-typed draft keeps it open.
  const [open, setOpen] = useState(false);
  const showBox = open || draft.length > 0;

  const submit = () => {
    addComment(findingId, draft);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit();
  };

  return (
    <div className="comments">
      {comments && comments.length > 0 && (
        <ul className="comments__list">
          {comments.map((c) => (
            <li key={c.id}>
              <p>{c.text}</p>
              <time dateTime={c.createdAt}>
                {new Date(c.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
              </time>
            </li>
          ))}
        </ul>
      )}
      {showBox ? (
        <>
          <label className="visually-hidden" htmlFor={inputId}>
            Add a note
          </label>
          <textarea
            id={inputId}
            rows={2}
            placeholder="Add a note…"
            value={draft}
            autoFocus={open}
            onChange={(e) => setDraft(findingId, e.target.value)}
            onKeyDown={onKeyDown}
          />
          <button type="button" className="button button--secondary" disabled={!draft.trim()} onClick={submit}>
            Save note
          </button>
        </>
      ) : (
        <button type="button" className="button button--text" aria-expanded={false} onClick={() => setOpen(true)}>
          Add note
        </button>
      )}
    </div>
  );
}

/** The hint row at the bottom of an open card: the four keys used most. Keys come from SHORTCUTS. */
const HINTS: { action: ShortcutAction; label: string }[] = [
  { action: 'accept', label: 'accept' },
  { action: 'dismiss', label: 'dismiss' },
  { action: 'next', label: 'next' },
  { action: 'previous', label: 'previous' },
];

function ShortcutHints() {
  return (
    <p className="card__hints" aria-hidden="true">
      {HINTS.map(({ action, label }) => (
        <span key={action} className="card__hint">
          <kbd>{SHORTCUTS.find((s) => s.action === action)?.key}</kbd> {label}
        </span>
      ))}
    </p>
  );
}

function FindingBody({ finding, id }: { finding: ResolvedFinding; id: string }) {
  const decision = useReviewStore((s) => s.decisions[finding.id]);
  const decide = useReviewStore((s) => s.decide);
  const applied = useReviewStore((s) => s.applied.includes(finding.id));
  const bodyRef = useRef<HTMLDivElement>(null);
  const lastDecision = useRef(decision);

  // Accept / Dismiss / Undo swap each other out (the two branches have different `key`s on purpose:
  // without them React reuses one <button> for both, and focus would stay on a button that changed meaning). Pressing one removes the button that has focus,
  // and the browser would drop focus on <body> (a keyboard user is then back at the top of the page).
  // So when that happens, hand focus to the button that replaced it. Focus that is somewhere
  // else (the card header after a shortcut, for example) is left alone.
  useEffect(() => {
    if (lastDecision.current === decision) return;
    lastDecision.current = decision;
    const focusLost = document.activeElement === document.body || document.activeElement === null;
    if (!focusLost) return;
    // An applied edit has its own Revert button, listed before Undo: prefer it, so one more Enter never undoes the decision.
    bodyRef.current
      ?.querySelector<HTMLElement>(decision ? '[data-action="revert"], [data-action="undo"]' : '[data-action="accept"]')
      ?.focus();
  }, [decision]);

  return (
    <div className="card__body" id={id} ref={bodyRef}>
      <div className="card__meta">
        <span className="card__meta-item">{finding.category}</span>
        <Confidence value={finding.confidence} />
      </div>
      <AnchorNotice finding={finding} />
      <p className="card__explanation">{finding.explanation}</p>
      <SuggestedChange finding={finding} />
      <ApplyEdit finding={finding} />
      {decision ? (
        <div className="card__decided" key="decided">
          <span className={`chip chip--${decision}`}>{decision === 'accepted' ? 'Accepted' : 'Dismissed'}</span>
          <button type="button" className="button button--ghost" data-action="undo"
            aria-label={applied ? 'Undo: remove the decision and revert the applied edit' : undefined}
            onClick={() => decide(finding.id, null)}
          >
            Undo
          </button>
        </div>
      ) : (
        <div className="card__actions" key="actions">
          <button type="button" className="button" data-action="accept" onClick={() => decide(finding.id, 'accepted')}>
            Accept
          </button>
          <button type="button" className="button button--secondary" onClick={() => decide(finding.id, 'dismissed')}>
            Dismiss
          </button>
        </div>
      )}
      <Comments findingId={finding.id} />
      <ShortcutHints />
    </div>
  );
}

/**
 * A finding in the margin. Compact until selected, then it opens to show everything.
 * The open body is only mounted while selected, so 24 closed cards stay cheap.
 */
export const FindingCard = memo(function FindingCard({ findingId }: { findingId: string }) {
  const finding = useReviewStore((s) => s.model?.byId.get(findingId));
  const selected = useReviewStore((s) => s.selection?.findingId === findingId);
  const decision = useReviewStore((s) => s.decisions[findingId]);
  const commentCount = useReviewStore((s) => s.comments[findingId]?.length ?? 0);
  const select = useReviewStore((s) => s.select);
  const bodyId = useId();

  if (!finding) return null;

  const classes = ['card', `card--${finding.severity}`];
  if (selected) classes.push('card--selected');
  if (decision) classes.push(`card--${decision}`);

  return (
    <article className={classes.join(' ')} id={`finding-${finding.id}`}>
      <h3 className="card__heading">
        <button
          type="button"
          className="card__header"
          aria-expanded={selected}
          aria-controls={selected ? bodyId : undefined}
          onClick={() => select(selected ? null : finding.id, 'card')}
        >
          <span className="card__top">
            <SeverityBadge severity={finding.severity} />
            {decision && <span className={`chip chip--${decision}`}>{decision === 'accepted' ? 'Accepted' : 'Dismissed'}</span>}
            {finding.anchorStatus === 'none' && <span className="chip">Whole document</span>}
            {finding.anchorStatus === 'repaired' && <span className="chip chip--warn">Approximate location</span>}
            {finding.anchorStatus === 'unresolved' && <span className="chip chip--warn">Text not found</span>}
          </span>
          <span className="card__title">{finding.title}</span>
          {commentCount > 0 && (
            <span className="card__flags">
              {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </span>
          )}
        </button>
      </h3>
      {selected && <FindingBody finding={finding} id={bodyId} />}
    </article>
  );
});
