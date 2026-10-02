import { buildEditPreview, paragraphLookup, previewText } from './diff';
import { applyToText, editsByParagraph, type AppliedEdit } from './edits';
import { compareForNavigation } from './model';
import type { Contract, Decision, ResolvedFinding, ReviewComment, ReviewModel, ReviewStatus, Severity } from './types';

/** Everything the summary screen and the exported file show. Always calculated, never stored. */
export interface SummaryItem {
  finding: ResolvedFinding;
  /** "Clause 9.2", "Whole document", ... plus a note when the location is not certain. */
  location: string;
  /** The text the suggested change would replace, read from the DOCUMENT (not the agent's quote). Only when we verified where it is. */
  originalText: string | null;
  /** The full sentence as it would read after the change. Only for exact anchors. */
  sentenceAfter: string | null;
  comments: ReviewComment[];
  /** The suggested edit was applied to the draft. */
  applied: boolean;
  /** The whole paragraph as it reads with every applied edit in it. Only for applied items. */
  revisedParagraph: string | null;
}

export interface ReviewSummary {
  groups: Record<ReviewStatus, SummaryItem[]>;
  total: number;
  /** How many suggested edits are applied to the draft. */
  appliedCount: number;
  /** Severity counts of the findings still undecided (what a reviewer should worry about before finishing). */
  pendingBySeverity: Record<Severity, number>;
}

function paragraphNumbers(contract: Contract | null): Map<string, string | null> {
  const map = new Map<string, string | null>();
  for (const section of contract?.sections ?? []) {
    for (const p of section.paragraphs ?? []) if (!map.has(p.id)) map.set(p.id, p.number);
  }
  return map;
}

export function describeLocation(finding: ResolvedFinding, numbers: Map<string, string | null>): string {
  let where: string;
  if (!finding.homeParagraphId) where = 'Whole document';
  else {
    // A finding that runs across paragraphs (f-02: 3.4 into 3.5) names the whole range.
    const ids = [...new Set(finding.spans.map((span) => span.paragraphId))];
    const labels = (ids.length > 0 ? ids : [finding.homeParagraphId]).map((id) => numbers.get(id) ?? null);
    const first = labels[0];
    const last = labels[labels.length - 1];
    if (labels.length > 1 && first && last) where = `Clauses ${first}–${last}`;
    else where = first ? `Clause ${first}` : 'Preamble';
  }
  if (finding.anchorStatus === 'repaired') where += ' (location approximate)';
  if (finding.anchorStatus === 'unresolved') where += ' (quoted text not found)';
  return where;
}

/** Each group is in the order "Next" uses by default: High first, then top to bottom. */
export function buildSummary(
  model: ReviewModel | null,
  contract: Contract | null,
  decisions: Record<string, Decision>,
  comments: Record<string, ReviewComment[]>,
  appliedIds: readonly string[] = [],
): ReviewSummary {
  const numbers = paragraphNumbers(contract);
  const lookup = contract ? paragraphLookup(contract) : null;
  const groups: Record<ReviewStatus, SummaryItem[]> = { pending: [], accepted: [], dismissed: [] };
  const pendingBySeverity: Record<Severity, number> = { high: 0, medium: 0, low: 0 };

  const appliedEdits: Map<string, AppliedEdit[]> = model && lookup ? editsByParagraph(model, lookup, appliedIds) : new Map();
  const appliedSet = new Set<string>(
    [...appliedEdits.values()].flatMap((list) => list.map((e) => e.findingId)),
  );

  const ordered = [...(model?.findings ?? [])].sort(compareForNavigation('priority'));
  for (const finding of ordered) {
    const status: ReviewStatus = decisions[finding.id] ?? 'pending';
    if (status === 'pending') pendingBySeverity[finding.severity]++;
    const verified = finding.anchorStatus === 'exact' || finding.anchorStatus === 'repaired';
    // What the change replaces is read from the document itself. The agent's quote can differ from it
    // in small ways (curly vs straight apostrophes) when the location was repaired.
    const originalText =
      verified && contract && finding.spans.length > 0
        ? finding.spans.map((span) => lookup?.get(span.paragraphId)?.text.slice(span.start, span.end) ?? '').join(' ').trim() || null
        : verified
          ? (finding.anchor?.quote ?? null)
          : null;
    const preview = contract && lookup ? buildEditPreview(finding, lookup) : null;
    groups[status].push({
      finding,
      location: describeLocation(finding, numbers),
      originalText,
      sentenceAfter: preview?.mode === 'sentence' ? previewText(preview, 'after') : null,
      comments: comments[finding.id] ?? [],
      applied: appliedSet.has(finding.id),
      revisedParagraph: (() => {
        const span = finding.spans[0];
        if (!appliedSet.has(finding.id) || !span || !lookup) return null;
        const text = lookup.get(span.paragraphId)?.text;
        return text === undefined ? null : applyToText(text, appliedEdits.get(span.paragraphId) ?? []);
      })(),
    });
  }
  return { groups, total: ordered.length, appliedCount: appliedSet.size, pendingBySeverity };
}

const SEV = { high: 'High', medium: 'Medium', low: 'Low' } as const;

function itemMarkdown(item: SummaryItem): string {
  const f = item.finding;
  const lines = [`### [${SEV[f.severity]}] ${f.title}`, `${f.category} · ${item.location}${f.confidence === null ? '' : ` · ${Math.round(f.confidence * 100)}% confidence`}`];
  if (f.explanation) lines.push('', f.explanation);
  // A suggested change is a fragment; without the words it replaces it means little.
  if (f.suggestedEdit && item.originalText) lines.push('', `**Original text:** ${item.originalText}`);
  if (f.suggestedEdit) lines.push('', `**Suggested change:** ${f.suggestedEdit}`);
  if (f.suggestedEdit && item.sentenceAfter) lines.push('', `**Reads after the change:** ${item.sentenceAfter}`);
  if (item.applied && item.revisedParagraph) lines.push('', `**Applied to the draft.** The clause now reads: ${item.revisedParagraph}`);
  for (const c of item.comments) {
    lines.push('', `**Reviewer comment:**`, ...c.text.split('\n').map((line) => `> ${line}`));
  }
  return lines.join('\n');
}

export function summaryToMarkdown(
  summary: ReviewSummary,
  context: { title: string; agent?: { name: string; version: string }; finishedAt: string | null },
): string {
  const { groups } = summary;
  const out = [`# Review summary: ${context.title}`, ''];
  const meta = [
    context.agent && `Findings by ${context.agent.name} ${context.agent.version}`,
    context.finishedAt ? `Review finished ${new Date(context.finishedAt).toISOString().slice(0, 10)}` : 'Review not finished yet',
  ].filter(Boolean);
  out.push(meta.join(' · '), '');
  out.push(`- Accepted: ${groups.accepted.length}`, `- Dismissed: ${groups.dismissed.length}`, `- Not yet decided: ${groups.pending.length}`);
  if (summary.appliedCount > 0) out.push(`- Suggested edits applied to the draft: ${summary.appliedCount}`);
  out.push('');
  const sections: [string, SummaryItem[]][] = [
    ['Not yet decided', groups.pending],
    ['Accepted', groups.accepted],
    ['Dismissed', groups.dismissed],
  ];
  for (const [label, items] of sections) {
    if (items.length === 0) continue;
    out.push(`## ${label} (${items.length})`, '');
    for (const item of items) out.push(itemMarkdown(item), '');
  }
  return out.join('\n').trimEnd() + '\n';
}
