import { useEffect } from 'react';
import { scrollForSelection } from '../lib/scroll';
import { useReviewStore } from '../store/reviewStore';

/** Renders nothing. Lives in its own component so a selection does not re-render the whole document. */
export function SelectionScroller() {
  const selection = useReviewStore((s) => s.selection);
  useEffect(() => {
    if (!selection) return;
    scrollForSelection(selection.findingId, selection.source);
    // Keyboard users: put focus on the card that just opened, so the next Tab or arrow starts there
    // and a screen reader reads it. (preventScroll: the scroll above already placed it.)
    if (selection.source === 'key') {
      document
        .getElementById(`finding-${selection.findingId}`)
        ?.querySelector<HTMLElement>('.card__header')
        ?.focus({ preventScroll: true });
    }
  }, [selection]);
  return null;
}
