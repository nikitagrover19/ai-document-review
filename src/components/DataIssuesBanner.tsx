import { useReviewStore } from '../store/reviewStore';

/** Tells the reviewer when the review data itself had problems, instead of hiding them. */
export function DataIssuesBanner() {
  const issues = useReviewStore((s) => s.model?.issues);
  if (!issues || issues.length === 0) return null;
  return (
    <details className="banner">
      <summary>
        {issues.length} {issues.length === 1 ? 'problem' : 'problems'} found in the review data
      </summary>
      <ul>
        {issues.map((issue, i) => (
          <li key={i}>{issue.message}</li>
        ))}
      </ul>
    </details>
  );
}
