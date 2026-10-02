// Helpers for comparing a quote with the document text.
//
// Why normalize? Quotes often differ from the document in harmless ways:
// curly vs straight apostrophes, double spaces, line breaks, zero-width characters.
// We ignore those differences when comparing, but we never ignore real wording
// or case differences. We always keep a map back to the ORIGINAL offsets, because
// the highlight must be drawn on the original text.

const ZERO_WIDTH = /[\u200B-\u200D\u2060\uFEFF]/;
const WHITESPACE = /\s/;

export interface NormalizedText {
  text: string;
  /** map[i] = index in the original string of normalized character i */
  map: number[];
}

function foldChar(ch: string): string {
  switch (ch) {
    case '\u2018':
    case '\u2019':
    case '\u201B':
    case '\u2032':
      return "'";
    case '\u201C':
    case '\u201D':
    case '\u201F':
    case '\u2033':
      return '"';
    case '\u2013':
    case '\u2014':
    case '\u2212':
      return '-';
    default:
      return ch;
  }
}

export function normalizeWithMap(input: string): NormalizedText {
  const out: string[] = [];
  const map: number[] = [];
  for (let i = 0; i < input.length; i++) {
    const ch = input.charAt(i);
    if (ZERO_WIDTH.test(ch)) continue;
    if (WHITESPACE.test(ch)) {
      // collapse runs of whitespace, drop leading whitespace
      if (out.length > 0 && out[out.length - 1] !== ' ') {
        out.push(' ');
        map.push(i);
      }
      continue;
    }
    out.push(foldChar(ch));
    map.push(i);
  }
  if (out[out.length - 1] === ' ') {
    out.pop();
    map.pop();
  }
  return { text: out.join(''), map };
}

/** All start positions of `needle` in `haystack`, overlapping matches included. */
export function findAll(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const hits: number[] = [];
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    hits.push(i);
    i = haystack.indexOf(needle, i + 1);
  }
  return hits;
}
