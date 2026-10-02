# AI document review

A review interface for the AI findings on the Northwind / Brightline vendor agreement. Findings sit in the margin next to the text they refer to. A reviewer can accept, dismiss or comment on each one, apply a suggested edit as a redline, and finish with a summary.

Built with React 19, TypeScript, Vite and Zustand. There is no annotation or UI library; the highlighting, margin cards and diff are written in this repo.

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # vitest: domain, store and component tests
npm run typecheck
npm run build
```

I developed and checked this on Node 22. The contract and the findings are in `data/`, and a small fake service (`src/services/reviewService.ts`) loads them with a delay so the loading state is visible.

Query parameters for the fake service:

- `?delay=2500` slows the load (default is 700 ms, capped at 10 s)
- `?fail=1` makes the load fail, which shows the error screen with a Retry button
- `?empty=1` returns no findings

Keyboard shortcuts, also listed in the Shortcuts menu:

| Key | Action |
|-----|--------|
| `j` / `k` | next / previous unresolved finding |
| `a` | accept the open finding |
| `d` | dismiss it |
| `u` | undo its decision |

The shortcuts are ignored while typing, with Ctrl/Cmd/Alt held, and while the summary dialog is open.

## What it does

**Document and findings together.** Each paragraph is one row: text on the left, the cards for its findings on the right. Clicking a highlight opens its card, and clicking a card brings its text into view. Only the other side scrolls. Findings with no anchor (such as f-09, a missing clause) show as "Whole document" cards at the top.

**Overview.** The top bar shows progress (decided out of total) and a risk score. Chips show counts by severity and by status, and a row of squares and a slim mini-map at the edge show where the findings are. The risk score runs from 0 to 100. Each undecided finding adds its severity weight (high 3, medium 2, low 1) times the agent's confidence, divided by the worst case, so it falls as findings are decided.

**Focus.** Filters for severity, status and category. "Next unresolved" visits all High findings first, then Medium, then Low, in document order within each group. A switch changes this to plain document order.

**Acting on findings.** Accept, dismiss, comment, undo. A comment alone does not count as a decision. Everything is saved to localStorage under a key made from the document id and the agent name and version, so decisions from one agent run are never applied to another. If storage is blocked the app still works and shows a "Not saved" chip.

**Suggested edits.** Each suggestion is shown as a word-level redline inside the full sentence it changes, because the agent's edits are fragments that hide how they join the surrounding text. Accepting with "Accept & apply edit" puts the change into the document view as struck-out old words followed by the new ones. Only findings with a verified anchor inside one paragraph can be applied. Two edits that cover the same words cannot both be applied, and any applied edit can be reverted.

**Finishing.** "Finish review" opens a summary that warns about undecided findings, High ones first, but does not block finishing. It can download a Markdown file with the decisions, comments and the clauses as they read after the applied edits. Reset is in the same dialog.

## Design decisions

The longer reasoning, with the alternatives, is in `docs/notes.md`.

**The quote decides, offsets are a hint.** Every anchor is checked against its quote and classed as exact, repaired by searching for the quote, unresolved, or whole-document. Text that could not be verified is never highlighted; the card shows the agent's quote instead. This matters in the sample data: the saved offsets for f-20 would highlight the wrong words (the quote is at 168-232, the offsets say 125-189). I did not use fuzzy matching, because legal text repeats itself and a fuzzy match would sometimes land on the wrong clause.

**Overlaps are handled by cutting the text.** Each paragraph is split at every highlight boundary, and each piece carries the ids of all findings covering it. Nested spans cannot express a partial overlap like f-04 / f-05, and rectangles drawn over the text break when the window is resized.

**One row per paragraph.** Putting the paragraph and its cards in the same row keeps them aligned with no measuring or collision code. I considered two separate panes (the eye travels too far in a long document) and absolutely positioned cards (needs collision handling).

**Derived values are not stored.** The store (Zustand) holds decisions, comments, the selection, the filters and the list of applied edit ids. Progress, risk, visible findings, highlight pieces, redlines and conflicts are computed from those.

**The original text is never modified.** An applied edit is only a finding id in a list. Offsets always refer to the original paragraph, so applying an edit in one place cannot shift another. This is why f-13 and f-22, which share paragraph 4.3, can both be applied.

**Accessibility.** Severity is shown by icon and word as well as colour. Removed and added text in the redline is struck through and underlined, and read out as "Removed" and "Added". The summary uses a native `<dialog>`. Accept, dismiss and undo changes are announced through a live region. I checked the text colour pairs in `src/styles/tokens.css` by calculation; all reach 4.5:1 except muted text on the grey page background, which is 4.46:1.

## What I prioritised, cut, and would do next

**Prioritised:** anchors that can be trusted, a quick review loop (cards, Next, filters, shortcuts), handling the messy parts of the data (f-02 spans two paragraphs, f-09 has no anchor, f-20 has wrong offsets, f-04 / f-05 overlap), and tests for the domain logic. There are 256 tests in 20 files.

**Cut:** virtualization for very long documents, the LLM follow-up chat, export of a full revised document (the Markdown summary contains only the changed clauses), and syncing between tabs (the last write wins).

**Assumptions:** desktop first, with cards stacking under their paragraph on narrow screens. A comment is not a decision. Highlights are a mouse shortcut and are not tab stops; the keyboard route is through the cards and Next / Previous.

**Not tested:** Firefox, and a screen reader (VoiceOver or NVDA). Performance was measured only for the domain functions, not for rendering; the numbers are in `docs/notes.md`.

**With more time:**
- A word-level diff drawn inside the document instead of only on the card.
- A rendering benchmark at 10,000 paragraphs using `content-visibility`.
- A separate store for half-typed comments (every keystroke currently runs every row's selectors).
- A screen-reader pass.
- A tighter review header to reduce the vertical space used by the top controls.
- Removing the duplicate finding-location navigation where the square strip and mini-map provide overlapping information.
- Making the risk metric's meaning more explicit so it is clear that it represents remaining unresolved risk.
- Making the finding navigation order more explicit in the UI.
- A more compact document title and metadata area to give more space to the review surface.
