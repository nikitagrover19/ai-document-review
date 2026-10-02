import type { SelectionSource } from '../store/reviewStore';

const escapeAttr = (value: string) => value.replace(/["\\]/g, '\\$&');

/**
 * Make sure the selected finding can be seen.
 *  - nav / key (Next / Previous / mini-map / shortcuts): the finding may be far away, so bring its row to the top.
 *  - document (the text was clicked): the card opens beside it; make sure the whole card is on screen.
 *  - card (the card was clicked): make sure the highlighted text is on screen.
 * Clicking never jumps the page more than needed.
 */
export function scrollForSelection(findingId: string, source: SelectionSource): void {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
  const card = document.getElementById(`finding-${findingId}`);

  if (source === 'nav' || source === 'key') {
    const row = card?.closest('.row') ?? card;
    row?.scrollIntoView?.({ block: 'start', behavior });
  } else if (source === 'document') {
    card?.scrollIntoView?.({ block: 'nearest', behavior });
  } else {
    document
      .querySelector(`mark[data-finding-ids~="${escapeAttr(findingId)}"]`)
      ?.scrollIntoView?.({ block: 'nearest', behavior });
  }
}
