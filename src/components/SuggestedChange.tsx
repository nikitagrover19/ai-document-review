import { useMemo } from 'react';
import { buildEditPreview, paragraphLookup } from '../domain/diff';
import type { ResolvedFinding } from '../domain/types';
import { useReviewStore } from '../store/reviewStore';

/**
 * The agent's suggested change, shown the way a reviewer can judge it: as a redline inside the full
 * sentence it would change. Changes are never colour only: removed text is struck through, added
 * text is underlined, and a screen reader hears "Removed:" / "Added:".
 *
 * Nothing here changes the document. The original text is never touched (see notes: Applying edits).
 */
export function SuggestedChange({ finding }: { finding: ResolvedFinding }) {
  const contract = useReviewStore((s) => s.contract);

  const preview = useMemo(
    () => (contract ? buildEditPreview(finding, paragraphLookup(contract)) : null),
    [contract, finding],
  );

  if (!finding.suggestedEdit) return null;

  // No verified place in the text: we can only show the words the agent proposed.
  if (!preview) {
    const why =
      finding.anchorStatus === 'unresolved'
        ? 'The quoted text was not found, so this cannot be shown against the document.'
        : 'This suggestion is not tied to one passage of the document.';
    return (
      <div className="card__edit">
        <span className="card__edit-label">Suggested change</span>
        <p>{finding.suggestedEdit}</p>
        <p className="edit__note">{why}</p>
      </div>
    );
  }

  const where =
    preview.clauses.length > 1
      ? `Clauses ${preview.clauses[0]}–${preview.clauses[preview.clauses.length - 1]}`
      : preview.clauses[0]
        ? `Clause ${preview.clauses[0]}`
        : null;

  return (
    <div className="card__edit">
      <span className="card__edit-label">
        Suggested change{preview.mode === 'sentence' && where ? ` · ${where}` : ''}
      </span>

      <p className="edit__text">
        {preview.pieces.map((piece, i) => {
          if (piece.kind === 'keep') return <span key={i}>{piece.text}</span>;
          if (piece.kind === 'break') {
            return (
              <span key={i} className="edit__break">
                <span aria-hidden="true">¶ </span>
                <span className="visually-hidden"> (next clause) </span>
              </span>
            );
          }
          if (piece.kind === 'del') {
            return (
              <del key={i} className="edit__del">
                <span className="visually-hidden">Removed: </span>
                {piece.text}
              </del>
            );
          }
          return (
            <ins key={i} className="edit__ins">
              <span className="visually-hidden">Added: </span>
              {piece.text}
            </ins>
          );
        })}
      </p>

      {preview.unchanged && <p className="edit__note">The suggestion is the same as the current text.</p>}
      {preview.crossesParagraphs && (
        <p className="edit__note">
          This change runs across {where?.toLowerCase() ?? 'two clauses'}. Applying it would join them into one paragraph, so it can only be previewed.
        </p>
      )}
      {preview.note && <p className="edit__note">{preview.note}</p>}
      {preview.warnings.map((warning) => (
        <p key={warning} className="edit__warning">
          <strong>Check the join.</strong> {warning}
        </p>
      ))}
    </div>
  );
}
