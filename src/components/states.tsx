/** The three "no content yet" screens: loading, error, and empty. */

export function LoadingState() {
  return (
    <div role="status" aria-live="polite">
      <span className="visually-hidden">Loading the review…</span>
      <div className="skeleton" aria-hidden="true">
        <div className="skeleton__line skeleton__line--title" />
        <div className="skeleton__line" />
        <div className="skeleton__line" />
        <div className="skeleton__line skeleton__line--short" />
        <div className="skeleton__line skeleton__line--title" />
        <div className="skeleton__line" />
        <div className="skeleton__line skeleton__line--short" />
      </div>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="state" role="alert">
      <h2 className="state__title">The review could not be loaded</h2>
      <p className="state__text">{message} Your decisions are not affected. Try again in a moment.</p>
      <button type="button" className="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function EmptyFindingsState() {
  return (
    <div className="state state--inline">
      <h2 className="state__title">Nothing to review</h2>
      <p className="state__text">
        The review agent did not report any findings for this document. You can still read the full text below.
      </p>
    </div>
  );
}
