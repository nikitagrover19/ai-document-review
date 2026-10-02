import { Fragment, memo, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { editFor, redlineSegments } from '../domain/edits';
import { pickPrimary } from '../domain/model';
import type { Paragraph } from '../domain/types';
import { useReviewStore } from '../store/reviewStore';
import { isVisible } from '../store/visibility';
import { FindingCard } from './FindingCard';

/**
 * One paragraph and its margin.
 *
 * Highlights: the text is cut into pieces (see domain/segments). Pieces with no finding stay
 * plain text. Pieces covered by findings become <mark> elements that carry the ids of the
 * findings they belong to, so ONE click handler on the document can serve every highlight.
 *
 * Applied edits (Step 9) are drawn as a redline on the SAME pieces: the replaced words are struck through
 * and the new words follow them. The original text is never changed; the paragraph just shows both.
 *
 * Memoized, and it listens only to its own spans and to "is the selected finding in me?",
 * so selecting a finding re-renders only the rows that contain it.
 */
export const ParagraphRow = memo(function ParagraphRow({ paragraph }: { paragraph: Paragraph }) {
  const spans = useReviewStore((s) => s.model?.spansByParagraph.get(paragraph.id));
  const byId = useReviewStore((s) => s.model?.byId);
  const homeIds = useReviewStore((s) => s.model?.cardsByParagraph.get(paragraph.id));
  // Every finding that touches this row: highlights that start here, plus cards that sit here.
  const rowIds = useMemo(
    () => [...new Set([...(spans?.map((span) => span.findingId) ?? []), ...(homeIds ?? [])])],
    [spans, homeIds],
  );
  // Which of them pass the filters right now? One plain string, so the row only
  // re-renders when its own answer changes.
  const visibleKey = useReviewStore((s) => rowIds.filter((id) => isVisible(s, id)).join(' '));
  const visible = useMemo(() => new Set(visibleKey ? visibleKey.split(' ') : []), [visibleKey]);
  const cardIds = useMemo(() => homeIds?.filter((id) => visible.has(id)), [homeIds, visible]);
  const shownSpans = useMemo(() => spans?.filter((span) => visible.has(span.findingId)), [spans, visible]);
  // Which of this row's findings are dismissed? A plain string, so the row only
  // re-renders when its own answer changes.
  const dismissedKey = useReviewStore((s) =>
    [...new Set(spans?.map((span) => span.findingId))].filter((id) => s.decisions[id] === 'dismissed').join(' '),
  );
  const selectedId = useReviewStore((s) => {
    const id = s.selection?.findingId;
    return id && spans?.some((span) => span.findingId === id) ? id : null;
  });

  const dismissed = useMemo(() => new Set(dismissedKey ? dismissedKey.split(' ') : []), [dismissedKey]);
  const acceptedKey = useReviewStore((s) =>
    [...new Set(spans?.map((span) => span.findingId))].filter((id) => s.decisions[id] === 'accepted').join(' '),
  );
  const accepted = useMemo(() => new Set(acceptedKey ? acceptedKey.split(' ') : []), [acceptedKey]);

  // Line the margin cards up with the top of the selected highlight (not just the top of the paragraph).
  // Clamped so the cards never stick out below the paragraph; the sheet height is not affected.
  const docRef = useRef<HTMLDivElement>(null);
  const stackRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const stack = stackRef.current;
    const doc = docRef.current;
    if (!stack) return;
    const mark = selectedId ? doc?.querySelector<HTMLElement>('.hl--selected') : null;
    if (!doc || !mark) return void stack.style.setProperty('--anchor-offset', '0px');
    const wanted = mark.getBoundingClientRect().top - doc.getBoundingClientRect().top;
    const room = Math.max(0, doc.offsetHeight - stack.offsetHeight);
    stack.style.setProperty('--anchor-offset', `${Math.round(Math.min(Math.max(0, wanted), room))}px`);
  }, [selectedId, cardIds]);
  // Which applied edits sit in this row? A plain string again, so the row ignores other rows' edits.
  const appliedKey = useReviewStore((s) =>
    s.applied.length > 0 && spans ? s.applied.filter((id) => spans.some((span) => span.findingId === id)).join(' ') : '',
  );
  const edits = useMemo(() => {
    if (!appliedKey || !byId) return [];
    const lookup = new Map([[paragraph.id, { text: paragraph.text, number: paragraph.number }]]);
    return appliedKey.split(' ').flatMap((id) => {
      const finding = byId.get(id);
      const edit = finding ? editFor(finding, lookup) : null;
      return edit ? [edit] : [];
    });
  }, [appliedKey, byId, paragraph]);
  // Applied edits are part of the draft, so they stay on screen even when their finding is filtered out.
  const segments = useMemo(() => redlineSegments(paragraph.text, shownSpans ?? [], edits), [paragraph.text, shownSpans, edits]);

  return (
    <div className="row" id={`para-${paragraph.id}`}>
      <div className="row__doc" ref={docRef}>
        <span className="row__number">{paragraph.number}</span>
        <p className="row__text">
          {segments.map((segment, i) => {
            let piece: ReactNode = segment.text;
            const primary = byId?.get(pickPrimary(segment.findingIds, byId) ?? '');
            if (segment.findingIds.length > 0 && primary) {
              const classes = ['hl', `hl--${primary.severity}`];
              // dashed underline = the location was repaired, so it is approximate
              if (primary.anchorStatus === 'repaired') classes.push('hl--approx');
              if (selectedId && segment.findingIds.includes(selectedId)) classes.push('hl--selected');
              // every finding on this piece is dismissed: fade the highlight
              if (segment.findingIds.every((id) => dismissed.has(id))) classes.push('hl--dismissed');
              // every finding on this piece is accepted: faded too, with a green underline
              else if (segment.findingIds.every((id) => accepted.has(id))) classes.push('hl--accepted');
              const others = segment.findingIds.length - 1;
              piece = (
                <mark
                  className={classes.join(' ')}
                  data-finding-ids={segment.findingIds.join(' ')}
                  data-more={others > 0 ? others : undefined}
                  title={primary.title}
                >
                  {segment.text}
                </mark>
              );
            }
            if (!segment.editId) return <Fragment key={segment.start}>{piece}</Fragment>;

            // Replaced words: struck through (not colour alone). Clicking them selects the finding that did it.
            const editSelected = selectedId === segment.editId ? ' edit--selected' : '';
            const firstOfEdit = segments[i - 1]?.editId !== segment.editId;
            return (
              <Fragment key={segment.start}>
                <del className={`edit__del edit__del--doc${editSelected}`} data-finding-ids={segment.editId}>
                  {firstOfEdit && <span className="visually-hidden">Removed: </span>}
                  {piece}
                </del>
                {segment.insertion !== null && (
                  <ins className={`edit__ins edit__ins--doc${editSelected}`} data-finding-ids={segment.editId}>
                    <span className="visually-hidden">Added: </span>
                    {segment.insertion}
                  </ins>
                )}
              </Fragment>
            );
          })}
        </p>
      </div>
      {cardIds && cardIds.length > 0 && (
        <div className="row__margin" data-margin role="group" aria-label="Findings for this paragraph">
          <div className="margin-stack" ref={stackRef}>
            {cardIds.map((id) => (
              <FindingCard key={id} findingId={id} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
