import { useEffect, useRef } from 'react';
import { conflictingApplied } from '../domain/edits';
import type { ResolvedFinding } from '../domain/types';
import { useReviewStore } from '../store/reviewStore';

/**
 * Apply the suggested edit to the draft, or take it back out.
 * The original document never changes: applying only adds this finding to the list of applied edits,
 * and the document view draws a redline (see ParagraphRow).
 *
 * Only exact, single-paragraph anchors can be applied (`finding.editable`). When two edits would touch
 * the same words, the second one is blocked and the card says which one is in the way.
 */
export function ApplyEdit({ finding }: { finding: ResolvedFinding }) {
  const applied = useReviewStore((s) => s.applied.includes(finding.id));
  // Strings, not arrays: a selector that builds a new array every time would make React re-render forever.
  const blockerIds = useReviewStore((s) => (s.model ? conflictingApplied(s.model, s.applied, finding.id).join(' ') : ''));
  const blockerTitle = useReviewStore((s) => {
    const id = blockerIds.split(' ')[0];
    return id ? (s.model?.byId.get(id)?.title ?? id) : '';
  });
  const applyEdit = useReviewStore((s) => s.applyEdit);
  const revertEdit = useReviewStore((s) => s.revertEdit);
  const rootRef = useRef<HTMLDivElement>(null);
  const wasApplied = useRef(applied);

  // Apply and Revert replace each other. The pressed button disappears, so hand focus to its replacement
  // (otherwise a keyboard user is dropped back at the top of the page).
  useEffect(() => {
    if (wasApplied.current === applied) return;
    wasApplied.current = applied;
    const lost = document.activeElement === document.body || document.activeElement === null;
    if (lost) rootRef.current?.querySelector<HTMLElement>(applied ? '[data-action="revert"]' : '[data-action="apply"]')?.focus();
  }, [applied]);

  if (!finding.suggestedEdit) return null;

  if (!finding.editable) {
    // Cross-paragraph changes explain themselves in the preview; the other case needs a word here.
    return finding.anchorStatus === 'repaired' ? (
      <p className="edit__note">Applying is turned off: the location is only approximate.</p>
    ) : null;
  }

  if (applied) {
    return (
      <div className="card__apply" ref={rootRef}>
        <span className="chip chip--applied">Edit applied to the draft</span>
        <button type="button" className="button button--ghost" data-action="revert" onClick={() => revertEdit(finding.id)}>
          Revert edit
        </button>
      </div>
    );
  }

  const blocked = blockerIds !== '';
  return (
    <div className="card__apply" ref={rootRef}>
      <button
        type="button"
        className="button button--secondary"
        data-action="apply"
        disabled={blocked}
        aria-describedby={blocked ? `apply-why-${finding.id}` : undefined}
        onClick={() => applyEdit(finding.id)}
      >
        Accept &amp; apply edit
      </button>
      {blocked && (
        <p className="edit__note" id={`apply-why-${finding.id}`}>
          This overlaps the applied change “{blockerTitle}”. Revert that edit first to apply this one.
        </p>
      )}
    </div>
  );
}
