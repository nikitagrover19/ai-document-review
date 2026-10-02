import { useMemo } from 'react';
import { compareForNavigation } from '../domain/model';
import { useReviewStore } from '../store/reviewStore';
import { visibleFindingIds } from '../store/visibility';
import { SEVERITY_LABEL, SeverityIcon } from './SeverityBadge';

/**
 * A thin row with one small square per finding, in document order: the same findings and the same
 * selection as the rail on the right (it uses the same visibility rule and the same `select`).
 * Colour AND the severity shape inside each square, so nothing relies on colour alone.
 * Like the rail ticks, the squares are a pointer shortcut; keyboard users use Previous / Next.
 */
export function FindingStrip() {
  const model = useReviewStore((s) => s.model);
  const visibleKey = useReviewStore((s) => visibleFindingIds(s).join(' '));
  const decisions = useReviewStore((s) => s.decisions);
  const selectedId = useReviewStore((s) => s.selection?.findingId ?? null);
  const select = useReviewStore((s) => s.select);

  const ids = useMemo(() => {
    const visible = new Set(visibleKey ? visibleKey.split(' ') : []);
    return (model?.findings ?? []).filter((f) => visible.has(f.id)).sort(compareForNavigation('document'));
  }, [model, visibleKey]);

  if (ids.length === 0) return null;
  return (
    <div className="strip">
      <ul className="strip__list" aria-label="Findings in document order">
        {ids.map((f) => {
          const decision = decisions[f.id];
          const classes = ['strip__item', `strip__item--${f.severity}`];
          if (decision) classes.push('strip__item--decided');
          if (f.id === selectedId) classes.push('strip__item--current');
          const state = decision === 'accepted' ? ', accepted' : decision === 'dismissed' ? ', dismissed' : '';
          return (
            <li key={f.id}>
              <button
                type="button"
                tabIndex={-1}
                className={classes.join(' ')}
                aria-current={f.id === selectedId ? 'true' : undefined}
                title={f.title}
                aria-label={`${SEVERITY_LABEL[f.severity]} severity${state}: ${f.title}`}
                onClick={() => select(f.id, 'nav')}
              >
                <SeverityIcon severity={f.severity} />
              </button>
            </li>
          );
        })}
      </ul>
      <p className="strip__legend" aria-hidden="true">
        <span className="strip__key strip__key--high">
          <SeverityIcon severity="high" /> High
        </span>
        <span className="strip__key strip__key--medium">
          <SeverityIcon severity="medium" /> Medium
        </span>
        <span className="strip__key strip__key--low">
          <SeverityIcon severity="low" /> Low
        </span>
        <span>grey = reviewed · outlined = open</span>
      </p>
    </div>
  );
}
