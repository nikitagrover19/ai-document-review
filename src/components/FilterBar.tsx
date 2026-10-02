import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { SEVERITIES, STATUSES, hasActiveFilters, summarize, toggle } from '../domain/filters';
import { stepPending } from '../domain/navigation';
import { SHORTCUTS } from '../lib/shortcuts';
import { useReviewStore } from '../store/reviewStore';
import { visibleFindingIds } from '../store/visibility';
import { FindingStrip } from './FindingStrip';
import { SEVERITY_LABEL, SeverityIcon } from './SeverityBadge';

const STATUS_LABEL = { pending: 'Pending', accepted: 'Accepted', dismissed: 'Dismissed' } as const;

/** "High, 3 findings". Spoken names must not depend on how the visual layout spaces words and numbers. */
const countLabel = (label: string, count: number) => `${label}, ${count} ${count === 1 ? 'finding' : 'findings'}`;

/** A <details> menu that closes on Escape (focus goes back to its button) or a click outside it. */
function useDismissible(ref: RefObject<HTMLDetailsElement | null>) {
  useEffect(() => {
    const close = () => ref.current && (ref.current.open = false);
    const onPointer = (e: PointerEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) {
        close();
        ref.current.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref]);
}

/** A drop-down list of checkboxes. Closes on Escape or a click outside. */
function CategoryMenu() {
  const model = useReviewStore((s) => s.model);
  const decisions = useReviewStore((s) => s.decisions);
  const selected = useReviewStore((s) => s.filters.categories);
  const setFilters = useReviewStore((s) => s.setFilters);
  const summary = useMemo(() => summarize(model?.findings ?? [], decisions), [model, decisions]);
  const ref = useRef<HTMLDetailsElement>(null);

  useDismissible(ref);

  return (
    <details className="menu" ref={ref}>
      <summary className="filter-chip filter-chip--menu" aria-pressed={undefined}>
        Category{selected.length > 0 && ` · ${selected.length}`}
      </summary>
      <div className="menu__panel" role="group" aria-label="Categories">
        {summary.byCategory.map(({ category, count }) => (
          <label key={category} className="menu__item">
            <input
              type="checkbox"
              aria-label={countLabel(category, count)}
              checked={selected.includes(category)}
              onChange={() => setFilters({ categories: toggle(selected, category) })}
            />
            <span>{category}</span>
            <span className="filter-chip__count">{count}</span>
          </label>
        ))}
      </div>
    </details>
  );
}

/** The keyboard shortcuts, listed where a reviewer will look for them. */
function ShortcutsMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useDismissible(ref);
  return (
    <details className="menu" ref={ref}>
      <summary className="filter-chip filter-chip--menu">Shortcuts</summary>
      <div className="menu__panel menu__panel--right" role="group" aria-label="Keyboard shortcuts">
        <dl className="shortcuts">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="shortcuts__row">
              <dt>
                <kbd>{s.key}</kbd>
              </dt>
              <dd>{s.label}</dd>
            </div>
          ))}
        </dl>
        <p className="shortcuts__note">Shortcuts are off while you type or while a dialog is open.</p>
      </div>
    </details>
  );
}

/**
 * The risk overview and the controls for focusing: counts by severity and status
 * (which double as filters), a category menu, and Previous / Next unresolved.
 */
export function FilterBar() {
  const model = useReviewStore((s) => s.model);
  const decisions = useReviewStore((s) => s.decisions);
  const filters = useReviewStore((s) => s.filters);
  const setFilters = useReviewStore((s) => s.setFilters);
  const clearFilters = useReviewStore((s) => s.clearFilters);
  const step = useReviewStore((s) => s.step);
  const navOrder = useReviewStore((s) => s.navOrder);
  const setNavOrder = useReviewStore((s) => s.setNavOrder);
  const summary = useMemo(() => summarize(model?.findings ?? [], decisions), [model, decisions]);

  const shown = useReviewStore((s) => visibleFindingIds(s).length);
  const unresolved = useReviewStore((s) => visibleFindingIds(s).filter((id) => !s.decisions[id]).length);
  const canStep = (direction: 1 | -1) => (s: Parameters<typeof visibleFindingIds>[0]) =>
    stepPending(visibleFindingIds(s), (id) => !s.decisions[id], s.selection?.findingId ?? null, direction) !== undefined;
  const canNext = useReviewStore(canStep(1));
  const canPrevious = useReviewStore(canStep(-1));
  const active = hasActiveFilters(filters);
  // Only matters on narrow screens, where the filter chips fold away to save room (see app.css).
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeCount = filters.severities.length + filters.statuses.length + filters.categories.length;

  return (
    <div className="filterbar" role="region" aria-label="Filter and navigate findings">
      <div className="filterbar__controls">
      <button
        type="button"
        className="filter-chip filterbar__toggle"
        aria-expanded={filtersOpen}
        aria-controls="filter-groups"
        onClick={() => setFiltersOpen(!filtersOpen)}
      >
        Filters{activeCount > 0 && ` · ${activeCount}`}
      </button>

      <div className="filterbar__filters" id="filter-groups" data-open={filtersOpen}>
      <div className="filter-group" role="group" aria-label="Severity">
        {SEVERITIES.map((severity) => (
          <button
            key={severity}
            type="button"
            className="filter-chip"
            aria-label={countLabel(SEVERITY_LABEL[severity], summary.bySeverity[severity])}
            aria-pressed={filters.severities.includes(severity)}
            onClick={() => setFilters({ severities: toggle(filters.severities, severity) })}
          >
            <SeverityIcon severity={severity} />
            {SEVERITY_LABEL[severity]}
            <span className="filter-chip__count">{summary.bySeverity[severity]}</span>
          </button>
        ))}
      </div>

      <div className="filter-group" role="group" aria-label="Status">
        {STATUSES.map((status) => (
          <button
            key={status}
            type="button"
            className="filter-chip"
            aria-label={countLabel(STATUS_LABEL[status], summary.byStatus[status])}
            aria-pressed={filters.statuses.includes(status)}
            onClick={() => setFilters({ statuses: toggle(filters.statuses, status) })}
          >
            {STATUS_LABEL[status]}
            <span className="filter-chip__count">{summary.byStatus[status]}</span>
          </button>
        ))}
      </div>

      <CategoryMenu />

      <div className="filter-group" role="group" aria-label="Order for Previous and Next">
        <span className="filter-group__label" aria-hidden="true">
          Next goes by
        </span>
        <button type="button" className="filter-chip" aria-pressed={navOrder === 'priority'} onClick={() => setNavOrder('priority')}>
          Severity
        </button>
        <button type="button" className="filter-chip" aria-pressed={navOrder === 'document'} onClick={() => setNavOrder('document')}>
          Document order
        </button>
      </div>

      </div>

      <div className="filterbar__nav" role="group" aria-label="Move between findings">
        <button type="button" className="button button--secondary" disabled={!canPrevious} aria-keyshortcuts="k" onClick={() => step(-1)}>
          Previous
        </button>
        <button type="button" className="button" disabled={!canNext} aria-keyshortcuts="j" onClick={() => step(1)}>
          Next unresolved
        </button>
      </div>
      </div>

      <div className="filterbar__meta">
      <FindingStrip />
      <p className="filterbar__count" aria-live="polite">
        {shown === 0 ? (
          'No findings match these filters.'
        ) : (
          <>
            <span>{`Showing ${shown} of ${summary.total}`}</span>
            <span>{`${unresolved} unresolved`}</span>
          </>
        )}
        {active && (
          <button type="button" className="button button--ghost" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </p>
      <ShortcutsMenu />
      </div>
    </div>
  );
}
