import type { Decision, ReviewModel, ReviewStatus } from '../domain/types';

export type { Decision, ReviewStatus };

export interface Progress {
  total: number;
  accepted: number;
  dismissed: number;
  pending: number;
  /** accepted + dismissed */
  decided: number;
}

export function statusOf(decisions: Record<string, Decision>, findingId: string): ReviewStatus {
  return decisions[findingId] ?? 'pending';
}

/**
 * Always calculated, never stored, so it cannot drift out of date.
 * Only findings that exist in the current model are counted, so a saved
 * decision for a finding that no longer exists cannot inflate the numbers.
 */
export function computeProgress(model: ReviewModel | null, decisions: Record<string, Decision>): Progress {
  const total = model?.findings.length ?? 0;
  let accepted = 0;
  let dismissed = 0;
  for (const finding of model?.findings ?? []) {
    const decision = decisions[finding.id];
    if (decision === 'accepted') accepted++;
    else if (decision === 'dismissed') dismissed++;
  }
  const decided = accepted + dismissed;
  return { total, accepted, dismissed, pending: total - decided, decided };
}

const SEVERITY_WEIGHT = { high: 3, medium: 2, low: 1 } as const;

/**
 * Risk score, 0-100, from the findings nobody has decided yet.
 * Each open finding adds weight (high 3, medium 2, low 1) x confidence (a missing confidence counts as 1).
 * That sum is divided by the worst case (every finding high at full confidence = 3 per finding),
 * so the score falls as findings are accepted or dismissed and reaches 0 when none are open.
 * Calculated, never stored, like the progress numbers.
 */
export function computeRisk(model: ReviewModel | null, decisions: Record<string, Decision>): number {
  const findings = model?.findings ?? [];
  if (findings.length === 0) return 0;
  let open = 0;
  for (const finding of findings) {
    if (!decisions[finding.id]) open += SEVERITY_WEIGHT[finding.severity] * (finding.confidence ?? 1);
  }
  return Math.round((open / (findings.length * SEVERITY_WEIGHT.high)) * 100);
}
