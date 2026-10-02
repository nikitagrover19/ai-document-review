import { useLayoutEffect, useMemo, useState } from 'react';
import { toPercent } from '../domain/navigation';
import type { Severity } from '../domain/types';
import { useReviewStore } from '../store/reviewStore';
import { visibleFindingIds } from '../store/visibility';
import { SEVERITY_LABEL } from './SeverityBadge';

interface Tick {
  id: string;
  severity: Severity;
  title: string;
  percent: number;
}

/**
 * A slim strip at the edge of the screen that shows the whole document at once:
 * one tick per visible finding (wider = more severe, faded = already decided),
 * and a window showing where you are. Click a tick to go there.
 * It is a pointer shortcut; keyboard users use Previous / Next, so ticks are not tab stops.
 */
export function MiniMap() {
  const model = useReviewStore((s) => s.model);
  const visibleKey = useReviewStore((s) => visibleFindingIds(s).join(' '));
  const decidedKey = useReviewStore((s) => Object.keys(s.decisions).join(' '));
  const selectedId = useReviewStore((s) => s.selection?.findingId ?? null);
  const select = useReviewStore((s) => s.select);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [view, setView] = useState({ top: 0, height: 100 });
  const decided = useMemo(() => new Set(decidedKey ? decidedKey.split(' ') : []), [decidedKey]);

  useLayoutEffect(() => {
    const doc = document.getElementById('document');
    if (!doc || !model) return;
    const ids = visibleKey ? visibleKey.split(' ') : [];

    const docMetrics = () => ({
      top: doc.getBoundingClientRect().top + window.scrollY,
      total: doc.offsetHeight,
    });
    const measure = () => {
      const { top, total } = docMetrics();
      const next: Tick[] = [];
      for (const id of ids) {
        const finding = model.byId.get(id);
        if (!finding) continue;
        const row = finding.homeParagraphId ? document.getElementById(`para-${finding.homeParagraphId}`) : null;
        const offset = row ? row.getBoundingClientRect().top + window.scrollY - top : 0;
        next.push({ id, severity: finding.severity, title: finding.title, percent: toPercent(offset, total) });
      }
      setTicks(next);
      updateView();
    };
    let frame = 0;
    const updateView = () => {
      const { top, total } = docMetrics();
      const start = toPercent(window.scrollY - top, total);
      setView({ top: start, height: Math.max(1, Math.min(100 - start, toPercent(window.innerHeight, total))) });
    };
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateView);
    };

    measure();
    // cards opening and closing change the document's height, so measure again
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(doc);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(frame);
    };
  }, [model, visibleKey]);

  if (ticks.length === 0) return null;
  return (
    <nav className="minimap" aria-label="Findings overview">
      <div className="minimap__view" style={{ top: `${view.top}%`, height: `${view.height}%` }} aria-hidden="true" />
      {ticks.map((tick) => (
        <button
          key={tick.id}
          type="button"
          tabIndex={-1}
          className={[
            'minimap__tick',
            `minimap__tick--${tick.severity}`,
            tick.id === selectedId && 'minimap__tick--selected',
            decided.has(tick.id) && 'minimap__tick--decided',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ top: `${tick.percent}%` }}
          title={tick.title}
          aria-label={`${SEVERITY_LABEL[tick.severity]} severity: ${tick.title}`}
          onClick={() => select(tick.id, 'nav')}
        />
      ))}
    </nav>
  );
}
