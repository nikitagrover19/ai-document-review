import { useEffect, type MouseEvent } from 'react';
import { chooseFindingOnClick } from '../domain/selection';
import type { Contract } from '../domain/types';
import { reviewStore } from '../store/reviewStore';
import { DocumentFindings } from './DocumentFindings';
import { ParagraphRow } from './ParagraphRow';
import { SelectionScroller } from './SelectionScroller';

/** One click handler for the whole document (cheaper than one per highlight). */
function handleDocumentClick(event: MouseEvent<HTMLElement>) {
  const target = event.target as HTMLElement;
  // Clicks inside a finding card are the card's business, not the document's.
  if (target.closest('[data-margin]')) return;
  // The reviewer was selecting text to copy it: do not treat that as a click.
  if (window.getSelection()?.toString()) return;

  const state = reviewStore.getState();
  const mark = target.closest<HTMLElement>('[data-finding-ids]');
  if (!mark || !state.model) return state.select(null);

  const next = chooseFindingOnClick(
    mark.dataset.findingIds?.split(' ') ?? [],
    state.selection?.findingId ?? null,
    state.model.byId,
  );
  if (next) state.select(next, 'document');
}

export function DocumentView({ contract }: { contract: Contract }) {
  // Escape clears the selection.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Escape inside a comment box or the summary dialog belongs to it, not to the selection.
      if ((event.target as HTMLElement | null)?.closest?.('input, textarea, select, dialog, [contenteditable="true"]')) return;
      reviewStore.getState().select(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const sections = contract.sections ?? [];
  if (sections.every((s) => (s.paragraphs ?? []).length === 0)) {
    return (
      <div className="state">
        <h2 className="state__title">This document has no text</h2>
        <p className="state__text">There is nothing to show here.</p>
      </div>
    );
  }
  return (
    // The click handler is a mouse shortcut. Keyboard users select findings from the cards.
    <div id="document" tabIndex={-1} onClick={handleDocumentClick}>
      <SelectionScroller />
      <DocumentFindings />
      {sections.map((section) => (
        <section key={section.id} className="section" aria-labelledby={`h-${section.id}`}>
          <h2 className="section__title" id={`h-${section.id}`}>
            {section.number && <span className="section__number">{section.number}</span>}
            {section.heading}
          </h2>
          {(section.paragraphs ?? []).map((paragraph) => (
            <ParagraphRow key={paragraph.id} paragraph={paragraph} />
          ))}
        </section>
      ))}
    </div>
  );
}
