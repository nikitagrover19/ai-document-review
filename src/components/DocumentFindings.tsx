import { useMemo } from 'react';
import { useReviewStore } from '../store/reviewStore';
import { isVisible } from '../store/visibility';
import { FindingCard } from './FindingCard';

/**
 * Findings that have no place in the text: about the document as a whole
 * (for example a missing clause), or whose paragraph could not be found at all.
 * Laid out like a paragraph row so the cards line up with every other card. Each card carries its
 * own "Whole document" chip, so this section needs no heading or explanation on screen.
 */
export function DocumentFindings() {
  const all = useReviewStore((s) => s.model?.documentLevel);
  const visibleKey = useReviewStore((s) => (all ?? []).filter((id) => isVisible(s, id)).join(' '));
  const ids = useMemo(() => (visibleKey ? visibleKey.split(' ') : []), [visibleKey]);
  if (ids.length === 0) return null;
  return (
    <section className="row doc-level" aria-labelledby="doc-level-title">
      {/* No visible heading: the card says "Whole document" itself. Screen-reader users still get a landmark. */}
      <h2 className="visually-hidden" id="doc-level-title">
        About the whole document
      </h2>
      <div className="row__margin" data-margin>
        <div className="margin-stack">
          {ids.map((id) => (
            <FindingCard key={id} findingId={id} />
          ))}
        </div>
      </div>
    </section>
  );
}
