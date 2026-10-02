import type { Contract, ResolvedFinding } from './types';

// Step 8: show a suggested edit the way a reviewer needs to read it.
//
// A suggested edit is a FRAGMENT ("labor strikes affecting an entire industry"). On its own it says
// little, and it hides problems at the seams (a doubled comma, a capital letter in the middle of a
// sentence). So we show it inside the full sentence it would change, as a redline, and also as the
// clean sentence it would produce.
//
// Everything here is pure: text in, pieces out. Nothing is stored and nothing in the document changes.

// ---------------------------------------------------------------------------------------------
// 1. Word-level diff
// ---------------------------------------------------------------------------------------------

export type PieceKind = 'keep' | 'del' | 'ins' | 'break';

/** One run of text in a redline. `break` is a paragraph boundary inside a cross-paragraph change. */
export interface Piece {
  kind: PieceKind;
  text: string;
}

// A word keeps its apostrophes and hyphens ("Customer’s", "non-exclusive"); punctuation and
// whitespace are tokens of their own. Whitespace being a token (not glued to a word) matters:
// it lets both sides of the diff be rebuilt EXACTLY, so "Deliverables[- during the term-] solely"
// never loses or invents a space.
const TOKEN = /\s+|[\p{L}\p{N}]+(?:[’'\-–][\p{L}\p{N}]+)*|[^\s\p{L}\p{N}]/gu;
const HAS_WORD_CHAR = /[\p{L}\p{N}]/u;

const tokenize = (input: string): string[] => input.match(TOKEN) ?? [];

interface Op {
  kind: 'equal' | 'del' | 'ins';
  token: string;
}

// Past this many table cells we stop being clever and show one block replacement.
// (About 700 tokens against 700 tokens: far beyond anything a reviewer can read as a redline anyway.)
const MAX_DIFF_CELLS = 500_000;

function lcsOps(a: string[], b: string[]): Op[] | null {
  const n = a.length;
  const m = b.length;
  if (n * m > MAX_DIFF_CELLS) return null;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1]! + 1
          : Math.max(table[(i + 1) * width + j]!, table[i * width + j + 1]!);
    }
  }
  const ops: Op[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ kind: 'equal', token: a[i]! });
      i++;
      j++;
    } else if (table[(i + 1) * width + j]! >= table[i * width + j + 1]!) {
      ops.push({ kind: 'del', token: a[i++]! });
    } else {
      ops.push({ kind: 'ins', token: b[j++]! });
    }
  }
  for (; i < n; i++) ops.push({ kind: 'del', token: a[i]! });
  for (; j < m; j++) ops.push({ kind: 'ins', token: b[j]! });
  return ops;
}

const wordCount = (tokens: string[]) => tokens.filter((t) => HAS_WORD_CHAR.test(t)).length;

/**
 * Raw LCS output is noisy: it happily "keeps" a lone space, "(" or "the" between two unrelated
 * changes, which reads as confetti. Short matches stuck between changes are folded into the change.
 */
function absorbIslands(ops: Op[]): Op[] {
  const out: Op[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind !== 'equal') {
      out.push(ops[i++]!);
      continue;
    }
    let end = i;
    while (end < ops.length && ops[end]!.kind === 'equal') end++;
    const run = ops.slice(i, end);
    const flanked = i > 0 && end < ops.length; // changes on both sides
    const tokens = run.map((o) => o.token);
    const trivial = wordCount(tokens) < 2 || tokens.join('').trim().length <= 3;
    if (flanked && trivial) {
      for (const o of run) out.push({ kind: 'del', token: o.token });
      for (const o of run) out.push({ kind: 'ins', token: o.token });
    } else {
      out.push(...run);
    }
    i = end;
  }
  return out;
}

function push(pieces: Piece[], kind: PieceKind, text: string) {
  if (!text) return;
  const last = pieces[pieces.length - 1];
  if (last && last.kind === kind) last.text += text;
  else pieces.push({ kind, text });
}

/**
 * Redline of `before` -> `after`. Equal text is 'keep'. Inside a change, removals come before insertions.
 * Rebuilding: keep + del = `before`, keep + ins = `after` (exactly, spaces included).
 */
export function diffWords(before: string, after: string): Piece[] {
  if (before === after) return before ? [{ kind: 'keep', text: before }] : [];
  const a = tokenize(before);
  const b = tokenize(after);
  const raw = lcsOps(a, b);
  const replaceAll = (): Piece[] => {
    const pieces: Piece[] = [];
    push(pieces, 'del', before);
    push(pieces, 'ins', after);
    return pieces;
  };
  if (!raw) return replaceAll();

  const ops = absorbIslands(raw);

  // Mostly a rewrite? Then interleaved bits of agreement help nobody: show old block, new block.
  const equalWords = wordCount(ops.filter((o) => o.kind === 'equal').map((o) => o.token));
  const longest = Math.max(wordCount(a), wordCount(b));
  if (longest > 0 && equalWords / longest < 0.3) return replaceAll();

  const pieces: Piece[] = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i]!.kind === 'equal') {
      push(pieces, 'keep', ops[i]!.token);
      i++;
      continue;
    }
    let end = i;
    while (end < ops.length && ops[end]!.kind !== 'equal') end++;
    const block = ops.slice(i, end);
    push(pieces, 'del', block.filter((o) => o.kind === 'del').map((o) => o.token).join(''));
    push(pieces, 'ins', block.filter((o) => o.kind === 'ins').map((o) => o.token).join(''));
    i = end;
  }
  return pieces;
}

// ---------------------------------------------------------------------------------------------
// 2. Finding the sentence around a span
// ---------------------------------------------------------------------------------------------

// A period after one of these does not end a sentence. Legal text is full of them.
const ABBREVIATIONS = new Set([
  'inc', 'ltd', 'co', 'corp', 'llc', 'llp', 'no', 'nos', 'sec', 'secs', 'art', 'cf', 'vs', 'etc',
  'e.g', 'i.e', 'u.s', 'a.m', 'p.m', 'mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'dept', 'approx', 'fig',
]);
const CLOSERS = new Set(['"', '”', '’', "'", ')', ']']);
const isSpace = (ch: string | undefined) => ch !== undefined && /\s/.test(ch);
const isLower = (ch: string | undefined) => ch !== undefined && /\p{Ll}/u.test(ch);

/**
 * Does a sentence end at index `i`? (`i` = the index just after the final punctuation and any closing
 * quote or bracket, i.e. where the whitespace starts.)
 */
function sentenceEndsAt(text: string, i: number): boolean {
  if (i >= text.length) return true;
  if (!isSpace(text[i])) return false;
  let j = i - 1;
  while (j >= 0 && CLOSERS.has(text[j]!)) j--;
  const mark = text[j];
  if (mark !== '.' && mark !== '!' && mark !== '?') return false;
  if (mark === '.') {
    const word = /([\p{L}.]+)$/u.exec(text.slice(0, j))?.[1]?.toLowerCase().replace(/^\.+/, '');
    if (word && ABBREVIATIONS.has(word)) return false;
    if (word && /^\p{Lu}$/u.test(text.slice(j - 1, j)) && word.length === 1) return false; // an initial: "J. Smith"
  }
  // A sentence begins with a capital, a digit, a quote or a bracket. A lowercase letter means "not yet".
  let k = i;
  while (isSpace(text[k])) k++;
  return k >= text.length || !isLower(text[k]);
}

/** Start of the sentence that contains `from` (0 when it is the first sentence of the paragraph). */
export function sentenceStart(text: string, from: number): number {
  for (let b = Math.min(from, text.length) - 1; b >= 1; b--) {
    if (!isSpace(text[b]) || isSpace(text[b - 1])) continue; // look at the first space after a mark only
    if (!sentenceEndsAt(text, b)) continue;
    let s = b;
    while (isSpace(text[s])) s++;
    if (s <= from) return s;
  }
  return 0;
}

/** End of the sentence that contains index `from - 1` (the text length when it is the last one). */
export function sentenceEnd(text: string, from: number): number {
  for (let i = Math.max(from, 1); i <= text.length; i++) {
    if (i === text.length) return text.length;
    if (isSpace(text[i]) && !isSpace(text[i - 1]) && sentenceEndsAt(text, i)) return i;
  }
  return text.length;
}

// ---------------------------------------------------------------------------------------------
// 3. The preview
// ---------------------------------------------------------------------------------------------

export interface ParagraphInfo {
  text: string;
  number: string | null;
}
export type ParagraphLookup = Map<string, ParagraphInfo>;

const lookups = new WeakMap<Contract, ParagraphLookup>();

/** id -> text and clause number. Built once per contract. The first paragraph wins when ids repeat (as in the rest of the app). */
export function paragraphLookup(contract: Contract): ParagraphLookup {
  const cached = lookups.get(contract);
  if (cached) return cached;
  const map: ParagraphLookup = new Map();
  for (const section of contract.sections ?? []) {
    for (const p of section.paragraphs ?? []) {
      if (!map.has(p.id)) map.set(p.id, { text: p.text ?? '', number: p.number });
    }
  }
  lookups.set(contract, map);
  return map;
}

export interface EditPreview {
  /** 'sentence': shown inside its full sentence. 'span': only the replaced words (no safe context). */
  mode: 'sentence' | 'span';
  /** Why the preview is 'span' only. */
  note: string | null;
  /** Clause numbers the change touches, in order. More than one = the change crosses paragraphs. */
  clauses: string[];
  crossesParagraphs: boolean;
  pieces: Piece[];
  /** Things worth a second look where the new words meet the old ones. Never blocks anything. */
  warnings: string[];
  /** The suggestion is identical to the current text. */
  unchanged: boolean;
}

/** Plain text of the sentence before the change (`before`) or after it (`after`). */
export function previewText(preview: EditPreview, which: 'before' | 'after'): string {
  const keep = which === 'before' ? 'del' : 'ins';
  return preview.pieces
    .map((p) => (p.kind === 'keep' || p.kind === keep ? p.text : p.kind === 'break' && which === 'before' ? ' ' : ''))
    .join('');
}

const TERMINAL = /[.!?]["”’')\]]*$/;

/** Cheap, deterministic checks at the two places where new text meets old text. */
function seamWarnings(lead: string, original: string, edit: string, trail: string): string[] {
  const warnings: string[] = [];
  const e = edit.trim();
  const after = trail.trimStart();
  if (!e) return warnings;

  const last = e.at(-1)!;
  const next = after[0];
  if (/[,;:.]/.test(last) && next && /[,;:.]/.test(next)) {
    warnings.push(`The change ends with “${last}” and the text after it starts with “${next}”, so the punctuation would be doubled.`);
  }
  if (TERMINAL.test(e) && next && (isLower(next) || next === ',')) {
    warnings.push('The change ends the sentence, but the original sentence carries on after it.');
  }
  const before = lead.trimEnd();
  const o = original.trimStart()[0];
  if (before && !TERMINAL.test(before) && !/[:;]$/.test(before) && /\p{Lu}/u.test(e[0]!) && isLower(o)) {
    warnings.push('The change starts with a capital letter in the middle of a sentence.');
  }
  return warnings;
}

/**
 * Build the redline for one finding, or null when there is nothing to show against the document.
 *
 *  - exact anchor: the change inside its full sentence (or sentences, when it crosses paragraphs)
 *  - repaired anchor: only the replaced words. We found the quote by searching, so the place is
 *    approximate, and the context around it might not be what the agent meant.
 *  - unresolved / whole-document / no suggestion: null (the card shows the plain suggestion)
 */
export function buildEditPreview(finding: ResolvedFinding, paragraphs: ParagraphLookup): EditPreview | null {
  const edit = finding.suggestedEdit;
  if (!edit || finding.spans.length === 0) return null;
  if (finding.anchorStatus !== 'exact' && finding.anchorStatus !== 'repaired') return null;

  const spans = finding.spans;
  const first = spans[0]!;
  const lastSpan = spans[spans.length - 1]!;
  const firstPara = paragraphs.get(first.paragraphId);
  const lastPara = paragraphs.get(lastSpan.paragraphId);
  if (!firstPara || !lastPara) return null;

  const parts = spans.map((s) => paragraphs.get(s.paragraphId)?.text.slice(s.start, s.end) ?? '');
  const crosses = spans.length > 1;
  const clauses = spans.map((s) => paragraphs.get(s.paragraphId)?.number).filter((n): n is string => !!n);
  const exact = finding.anchorStatus === 'exact';

  const lead = exact ? firstPara.text.slice(sentenceStart(firstPara.text, first.start), first.start) : '';
  const trail = exact ? lastPara.text.slice(lastSpan.end, sentenceEnd(lastPara.text, lastSpan.end)) : '';

  const pieces: Piece[] = [];
  let unchanged = false;
  if (!crosses) {
    // Whitespace at the edges of the span is not part of the change: keep it as it is.
    const original = parts[0]!;
    const core = original.trim();
    const lw = original.slice(0, original.length - original.trimStart().length);
    const tw = original.slice(original.trimEnd().length);
    push(pieces, 'keep', lead + lw);
    const diff = diffWords(core, edit.trim());
    unchanged = diff.every((p) => p.kind === 'keep');
    for (const p of diff) push(pieces, p.kind, p.text);
    push(pieces, 'keep', tw + trail);
  } else {
    // The replacement covers several paragraphs. A word diff across a paragraph break would be
    // misleading, so show everything removed, then everything added.
    push(pieces, 'keep', lead);
    parts.forEach((part, i) => {
      if (i > 0) pieces.push({ kind: 'break', text: '¶' });
      push(pieces, 'del', part);
    });
    push(pieces, 'ins', edit.trim());
    push(pieces, 'keep', trail);
  }

  return {
    mode: exact ? 'sentence' : 'span',
    note: exact ? null : 'The location is approximate, so only the replaced words are shown, not the sentence around them.',
    clauses,
    crossesParagraphs: crosses,
    pieces,
    warnings: exact ? seamWarnings(lead, parts[0]!, edit, trail) : [],
    unchanged,
  };
}
