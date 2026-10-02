// ---------- Raw input (what the JSON files give us) ----------

export type Severity = 'high' | 'medium' | 'low';

export interface Paragraph {
  id: string;
  number: string | null; // the preamble has no numbers
  text: string;
}

export interface Section {
  id: string;
  number: string | null;
  heading: string;
  paragraphs: Paragraph[];
}

export interface Contract {
  id: string;
  title: string;
  effectiveDate?: string;
  parties?: { role: string; name: string }[];
  sections: Section[];
}

/** The location the agent claims. Offsets are zero-based, `end` is exclusive. */
export interface RawAnchor {
  paragraphId: string;
  start: number;
  end: number; // refers to endParagraphId when that is present
  endParagraphId?: string;
  quote: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  category: string;
  title: string;
  explanation: string;
  anchor: RawAnchor | null; // null = about the document as a whole
  suggestedEdit: string | null;
  confidence: number | null; // 0..1, null if the file had no usable value
}

export interface FindingsFile {
  documentId?: string;
  agent?: { name: string; version: string };
  generatedAt?: string;
  findings: unknown[]; // unknown on purpose: we validate it
}

// ---------- After we have checked the data ----------

/**
 * exact      - the saved offsets point at text that matches the quote
 * repaired   - offsets were wrong, but we found the quote by searching
 * unresolved - we could not verify where this finding points. NEVER highlighted.
 * none       - the agent says it is about the whole document (anchor is null)
 */
export type AnchorStatus = 'exact' | 'repaired' | 'unresolved' | 'none';

// ---------- The reviewer's work ----------

/** What "Next" and "Previous" follow: severity tiers (top to bottom inside each), or plain reading order. */
export type NavOrder = 'priority' | 'document';

export type Decision = 'accepted' | 'dismissed';

export interface ReviewComment {
  id: string;
  text: string;
  createdAt: string; // ISO date
}
export type ReviewStatus = 'pending' | Decision;

/** Empty list = no restriction. Inside one list: OR. Between lists: AND. */
export interface Filters {
  severities: Severity[];
  categories: string[];
  statuses: ReviewStatus[];
}

/** One highlighted range inside ONE paragraph. Half-open: [start, end). */
export interface Span {
  findingId: string;
  paragraphId: string;
  start: number;
  end: number;
}

export interface ResolvedFinding extends Finding {
  anchorStatus: AnchorStatus;
  /** Plain-language reason, shown to the reviewer when status is repaired/unresolved. */
  anchorNote: string | null;
  /** Empty unless status is exact or repaired. A cross-paragraph anchor has several. */
  spans: Span[];
  /** The paragraph row where this finding's card sits. null = document-level strip. */
  homeParagraphId: string | null;
  /** Only an exact anchor inside ONE paragraph, with a suggested edit, may ever be applied. */
  editable: boolean;
  /** Reading-order rank in the document (0 = first). Whole-document findings come first. */
  docIndex: number;
}

/** A slice of a paragraph and the findings that cover it. */
export interface Segment {
  start: number;
  end: number;
  text: string;
  findingIds: string[]; // empty = plain text
}

export type DataIssueKind =
  | 'finding-skipped'
  | 'duplicate-finding-id'
  | 'duplicate-paragraph-id'
  | 'confidence-adjusted'
  | 'document-mismatch';

/** Something wrong with the input that the UI should be able to tell the reviewer about. */
export interface DataIssue {
  kind: DataIssueKind;
  findingId?: string;
  message: string;
}

export interface ReviewModel {
  findings: ResolvedFinding[];
  byId: Map<string, ResolvedFinding>;
  /** Highlights, pre-indexed per paragraph so a paragraph only looks at its own. */
  spansByParagraph: Map<string, Span[]>;
  /** Finding ids whose card sits in each paragraph row. */
  cardsByParagraph: Map<string, string[]>;
  /** Findings shown in the whole-document strip. */
  documentLevel: string[];
  issues: DataIssue[];
}
