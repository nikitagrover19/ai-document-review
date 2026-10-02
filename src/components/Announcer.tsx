import { useEffect, useState } from 'react';
import { reviewStore } from '../store/reviewStore';
import { computeProgress } from '../store/progress';
import { visibleFindingIds } from '../store/visibility';
import { SEVERITY_LABEL } from './SeverityBadge';

/**
 * A screen-reader-only status line. Sighted users see a card open and the page scroll;
 * without this, a screen-reader user who presses "Next" or "Accept" hears nothing at all.
 *
 *  - Next / Previous button, mini-map: says which finding is now open and where it is in the list.
 *  - Accept / Dismiss / Undo (any way of doing it): confirms, with the new progress.
 *
 * Shortcut navigation (source 'key') is not announced here: focus moves to the card, and the
 * screen reader reads the focused card itself.
 */
export function Announcer() {
  const [message, setMessage] = useState({ text: '', n: 0 });

  useEffect(() => {
    const say = (text: string) => setMessage((m) => ({ text, n: m.n + 1 }));
    return reviewStore.subscribe((state, prev) => {
      const { model } = state;
      if (!model) return;

      if (state.decisions !== prev.decisions) {
        const changed = Object.keys({ ...prev.decisions, ...state.decisions }).filter((k) => state.decisions[k] !== prev.decisions[k]);
        const p = computeProgress(model, state.decisions);
        if (changed.length > 1) return say(`Review reset. ${p.decided} of ${p.total} reviewed.`);
        const id = changed[0];
        const finding = id ? model.byId.get(id) : undefined;
        if (!id || !finding) return;
        const decision = state.decisions[id];
        const what = decision === 'accepted' ? 'Accepted' : decision === 'dismissed' ? 'Dismissed' : 'Decision undone for';
        return say(`${what}: ${finding.title}. ${p.decided} of ${p.total} reviewed.`);
      }

      const sel = state.selection;
      if (sel && sel.source === 'nav' && sel.findingId !== prev.selection?.findingId) {
        const finding = model.byId.get(sel.findingId);
        if (!finding) return;
        const ids = visibleFindingIds(state);
        const at = ids.indexOf(sel.findingId) + 1;
        say(`Finding ${at} of ${ids.length}: ${SEVERITY_LABEL[finding.severity]} severity. ${finding.title}.`);
      }
    });
  }, []);

  return (
    <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">
      {message.text}
      {message.n % 2 === 0 ? '' : '\u200B'}
    </p>
  );
}
