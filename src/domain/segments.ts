import type { Segment } from './types';

interface Range {
  findingId: string;
  start: number;
  end: number;
}

/**
 * Cut a paragraph into pieces at every highlight start/end.
 * Each piece lists the findings that cover it, so any overlap works:
 * partial, nested, identical, or three-way.
 *
 * Guarantees (these are tested):
 *  - the pieces are in order, do not overlap, and join back into the exact original text
 *  - empty or invalid ranges are ignored, ranges outside the text are clamped
 */
export function buildSegments(text: string, ranges: Range[]): Segment[] {
  const len = text.length;
  if (len === 0) return [];

  const valid: Range[] = [];
  for (const r of ranges) {
    const start = Math.max(0, Math.min(len, r.start));
    const end = Math.max(0, Math.min(len, r.end));
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      valid.push({ findingId: r.findingId, start, end });
    }
  }
  if (valid.length === 0) return [{ start: 0, end: len, text, findingIds: [] }];

  const cuts = new Set<number>([0, len]);
  for (const r of valid) {
    cuts.add(r.start);
    cuts.add(r.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  const segments: Segment[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i]!;
    const end = points[i + 1]!;
    const findingIds = valid.filter((r) => r.start <= start && r.end >= end).map((r) => r.findingId);
    segments.push({ start, end, text: text.slice(start, end), findingIds });
  }
  return segments;
}
