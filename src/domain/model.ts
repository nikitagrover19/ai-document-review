import { indexContract, resolveAnchor } from './anchors';
import type {
  Contract,
  DataIssue,
  Finding,
  FindingsFile,
  NavOrder,
  RawAnchor,
  ResolvedFinding,
  Severity,
  Span,
} from './types';
import type { ReviewModel } from './types';

const SEVERITIES: readonly Severity[] = ['high', 'medium', 'low'];
const SEVERITY_RANK: Record<Severity, number> = { high: 0, medium: 1, low: 2 };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Read the anchor without trusting it. Bad values stay bad so the resolver can reject them. */
function parseAnchor(raw: unknown): RawAnchor | null {
  if (raw === null || raw === undefined) return null;
  if (!isObject(raw)) return { paragraphId: '', start: NaN, end: NaN, quote: '' };
  const anchor: RawAnchor = {
    paragraphId: str(raw.paragraphId),
    start: typeof raw.start === 'number' ? raw.start : NaN,
    end: typeof raw.end === 'number' ? raw.end : NaN,
    quote: str(raw.quote),
  };
  if (typeof raw.endParagraphId === 'string' && raw.endParagraphId) anchor.endParagraphId = raw.endParagraphId;
  return anchor;
}

/**
 * Validate every finding. A finding we cannot use is reported in `issues`,
 * never dropped silently, so the UI can say "1 finding could not be loaded".
 */
export function parseFindings(rawList: unknown[]): { findings: Finding[]; issues: DataIssue[] } {
  const findings: Finding[] = [];
  const issues: DataIssue[] = [];
  const seen = new Set<string>();

  rawList.forEach((raw, i) => {
    if (!isObject(raw)) {
      issues.push({ kind: 'finding-skipped', message: `Entry ${i + 1} is not an object.` });
      return;
    }
    const id = str(raw.id);
    if (!id) {
      issues.push({ kind: 'finding-skipped', message: `Entry ${i + 1} has no id.` });
      return;
    }
    if (seen.has(id)) {
      issues.push({ kind: 'duplicate-finding-id', findingId: id, message: `Finding id ${id} appears twice; the first one is used.` });
      return;
    }
    if (!SEVERITIES.includes(raw.severity as Severity)) {
      issues.push({ kind: 'finding-skipped', findingId: id, message: `${id} has an unknown severity, so it was not loaded.` });
      return;
    }
    const title = str(raw.title);
    if (!title) {
      issues.push({ kind: 'finding-skipped', findingId: id, message: `${id} has no title, so it was not loaded.` });
      return;
    }

    let confidence: number | null = null;
    if (typeof raw.confidence === 'number' && Number.isFinite(raw.confidence)) {
      confidence = Math.min(1, Math.max(0, raw.confidence));
      if (confidence !== raw.confidence) {
        issues.push({ kind: 'confidence-adjusted', findingId: id, message: `${id} had confidence ${raw.confidence}; limited to ${confidence}.` });
      }
    }

    const edit = typeof raw.suggestedEdit === 'string' && raw.suggestedEdit.trim() ? raw.suggestedEdit : null;

    seen.add(id);
    findings.push({
      id,
      severity: raw.severity as Severity,
      category: str(raw.category) || 'Uncategorized',
      title,
      explanation: str(raw.explanation),
      anchor: parseAnchor(raw.anchor),
      suggestedEdit: edit,
      confidence,
    });
  });

  return { findings, issues };
}

/** Sort order for "what should I look at next": severity, then confidence, then id. */
export function compareByPriority(a: Finding, b: Finding): number {
  return (
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
    (b.confidence ?? -1) - (a.confidence ?? -1) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * The order "Next" walks through.
 *  - priority: High first, then Medium, then Low. Inside each, top to bottom of the document,
 *    so the page does not jump up and down (confidence says nothing about where a clause is).
 *  - document: plain reading order.
 */
export function compareForNavigation(order: NavOrder) {
  return (a: ResolvedFinding, b: ResolvedFinding): number =>
    (order === 'priority' ? SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] : 0) || a.docIndex - b.docIndex;
}

/** When a click lands on text covered by several findings, this one wins. */
export function pickPrimary(ids: string[], byId: Map<string, Finding>): string | undefined {
  return ids
    .map((id) => byId.get(id))
    .filter((f): f is Finding => f !== undefined)
    .sort(compareByPriority)[0]?.id;
}

export function buildReviewModel(contract: Contract, file: FindingsFile): ReviewModel {
  const { index, issues: contractIssues } = indexContract(contract);
  const { findings: parsed, issues: findingIssues } = parseFindings(file.findings ?? []);
  const issues: DataIssue[] = [...contractIssues, ...findingIssues];

  if (file.documentId && file.documentId !== contract.id) {
    issues.push({
      kind: 'document-mismatch',
      message: `These findings are for "${file.documentId}", but the open document is "${contract.id}".`,
    });
  }

  const findings: ResolvedFinding[] = parsed.map((f) => {
    const r = resolveAnchor(f, index);
    return {
      ...f,
      anchorStatus: r.status,
      anchorNote: r.note,
      spans: r.spans,
      homeParagraphId: r.homeParagraphId,
      // Applying an edit replaces ONE span. An edit across two paragraphs would merge them, so it is preview-only.
      editable: r.status === 'exact' && f.suggestedEdit !== null && r.spans.length === 1,
      docIndex: 0, // filled in below
    };
  });

  // Reading order: whole-document findings first, then by paragraph, then by position in it.
  const rank = (f: ResolvedFinding) => ({
    paragraph: f.homeParagraphId ? (index.byId.get(f.homeParagraphId)?.index ?? -1) : -1,
    offset: f.spans[0]?.start ?? 0,
  });
  [...findings]
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      return ra.paragraph - rb.paragraph || ra.offset - rb.offset || a.id.localeCompare(b.id);
    })
    .forEach((f, i) => (f.docIndex = i));

  const byId = new Map(findings.map((f) => [f.id, f]));
  const spansByParagraph = new Map<string, Span[]>();
  const cardsByParagraph = new Map<string, string[]>();
  const documentLevel: string[] = [];

  for (const f of findings) {
    for (const s of f.spans) {
      const list = spansByParagraph.get(s.paragraphId) ?? [];
      list.push(s);
      spansByParagraph.set(s.paragraphId, list);
    }
    if (f.homeParagraphId) {
      const list = cardsByParagraph.get(f.homeParagraphId) ?? [];
      list.push(f.id);
      cardsByParagraph.set(f.homeParagraphId, list);
    } else {
      documentLevel.push(f.id);
    }
  }

  // Inside a paragraph row, the most important card comes first.
  for (const ids of cardsByParagraph.values()) {
    ids.sort((a, b) => compareByPriority(byId.get(a)!, byId.get(b)!));
  }

  return { findings, byId, spansByParagraph, cardsByParagraph, documentLevel, issues };
}
