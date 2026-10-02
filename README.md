# AI Document Review

A review interface for AI findings on a vendor agreement. Findings appear in the margin next to the text they refer to. Reviewers can accept, dismiss, or comment on findings, apply suggested edits as a redline, and finish with a summary.

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest (domain, store, components)
npm run typecheck
npm run build
```

Demo switches for the fake service:

- `?delay=2500` - slow
- `?fail=1` - error + Retry
- `?empty=1` - no findings

Keyboard shortcuts:

- `j` / `k` - next / previous unresolved
- `a` - accept
- `d` - dismiss
- `u` - undo

These are also listed in the Shortcuts menu.

## What it does

### Context

One row per paragraph, with the text on the left and its finding cards on the right. Click a highlight to open its card, or click a card to see its text. Only the other side scrolls.

### At a glance

Shows severity, status, and category counts, along with a mini-map of finding locations and a progress bar for decided findings.

### Focus

Filters are available for severity, status, and category. "Next unresolved" goes through High findings first, then moves from top to bottom. There is also a document-order switch.

### Actions

Findings can be accepted, dismissed, commented on, or undone. Changes are saved in the browser using document + agent version as the key. Reset is available from the summary.

### Suggested edits

Suggested edits are shown as a redline inside the full sentence. Exact, single-paragraph edits can be applied.

The document keeps the original text unchanged. Conflicting edits are blocked, and every applied edit can be reverted.

### Finish

The summary dialog warns about undecided findings, with High findings first. A Markdown download is available and includes the revised clauses.

## Key decisions

The alternatives considered for these decisions are in `docs/notes.md`.

1. **The quote is the truth, offsets are a hint.**  
   Each anchor is checked against its quote: exact, repaired by search, unresolved, or whole-document. Unverified text is never highlighted. Real example: f-20's saved offsets would have highlighted the wrong words.

2. **Overlaps are split at every highlight edge.**  
   The text is cut into pieces at every highlight boundary. This handles partial overlaps such as f-04/f-05, which nested spans cannot.

3. **Margin cards use one row per paragraph.**  
   This keeps the cards aligned without measuring or collision maths.

4. **Zustand stores state; calculated values are derived.**  
   Progress, filters, highlight pieces, redlines, and conflicts are derived rather than stored.

5. **Applying an edit never changes the original.**  
   The store holds a list of finding ids. Offsets always refer to the original text, so edits in one paragraph do not shift edits in another.

6. **Accessibility is built into the review flow.**  
   Severity uses an icon, word, and colour. There is a computed contrast audit, native `<dialog>` support, focus handoff when a button replaces itself, and live-region announcements.

## Priorities, cuts, next

### Prioritised

- Trustworthy anchors
- A fast review loop with keyboard shortcuts, Next, and filters
- Data robustness
- A tested domain layer

### Cut

- Virtualization
- An LLM follow-up chat
- A full revised-document export
- Cross-tab sync (last write wins)

### Assumptions

- Desktop first
- A comment is not a decision
- Highlights are mouse shortcuts; the keyboard path is the cards

### With more time

- Word-level diff inside the document redline
- A rendering benchmark with 10k paragraphs and `content-visibility`
- Drafts in their own store
- A real screen-reader pass (VoiceOver/NVDA)
- Firefox
