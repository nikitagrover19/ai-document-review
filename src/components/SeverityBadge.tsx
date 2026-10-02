import type { Severity } from '../domain/types';

export const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function SeverityIcon({ severity }: { severity: Severity }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      {severity === 'high' && <path d="M6 1 L11.2 10.5 H0.8 Z" fill="currentColor" />}
      {severity === 'medium' && <path d="M6 0.8 L11.2 6 L6 11.2 L0.8 6 Z" fill="currentColor" />}
      {severity === 'low' && <circle cx="6" cy="6" r="4.6" fill="currentColor" />}
    </svg>
  );
}

/** Severity is always an icon shape AND a word, never colour alone. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`badge badge--${severity}`}>
      <SeverityIcon severity={severity} />
      {SEVERITY_LABEL[severity]}
      <span className="visually-hidden"> severity</span>
    </span>
  );
}
