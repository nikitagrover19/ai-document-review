# Running notes (feeds the final README)

## Decisions and the alternatives we rejected
- **Overlapping highlights:** cut each paragraph into pieces at every highlight edge, so any overlap works.
  Rejected: nested spans (cannot express partial overlaps such as f-04/f-05); drawn rectangles on top (fragile on resize).
- **Anchors:** the quote is the truth, offsets are only a hint. Exact / repaired / unresolved. Unverified text is never highlighted.
  Rejected: trusting offsets (f-20 in the real data would highlight the wrong words); fuzzy matching (false matches in repetitive legal text).
- **Layout:** margin cards, built as one row per paragraph (text left, its cards right), so alignment costs no measuring.
  Rejected: two panes (eye travels far in long documents); absolutely positioned cards (collision maths).
- **Selection sync:** one selected finding plus who selected it; only the other side scrolls.
- **State:** Zustand with selectors. Calculated data (progress, filtered lists, highlight pieces) is never stored.
- **Applying edits (planned, built last):** the original contract never changes; edits live in a separate list shown as a redline. Only exact anchors can be applied.
- **Done:** an explicit "Finish review" step; comments alone do not count as a decision.
- **Loading states:** tiny fake service. Demo switches: `?delay=2500`, `?fail=1`, `?empty=1`.
- **Styling:** all colours, sizes and spacing live in `src/styles/tokens.css`.

## Real-data findings worth mentioning
- f-20: saved offsets 125-189 would have highlighted "ng acts of God, ... labor shortages, fail". The quote is really at 168-232. Caught by checking the quote.
- f-04 / f-05 overlap on p-6.2; f-02 spans two paragraphs; f-09 has no anchor; f-13 / f-22 share a paragraph.

## Assumptions
- Desktop first; on narrow screens cards stack under their paragraph.
- A comment alone is not a decision.

## Step 3: highlights
- Text is cut into pieces; plain pieces stay plain text, covered pieces become `<mark>` carrying the ids of their findings (`data-finding-ids`). One delegated click handler serves every highlight.
- Colour is never the only signal: dashed underline = approximate (repaired) location; "+N" badge (drawn with CSS, never copied) = more findings overlap.
- Clicking an overlap again steps through every finding that covers it; Escape or a click on plain text clears the selection.
- A click is ignored while the reviewer is selecting text to copy it.
- Highlights are mouse shortcuts and not tab stops. The keyboard path is through the finding cards (Step 4/5) with next/previous. Assumption to state in the README.

## Step 4: finding cards
- Cards sit in the margin of their paragraph row; closed by default (severity, title, status chips), one open at a time. The open body is only mounted while open.
- Severity = icon shape + word. Low confidence (under 60%) is called out in words; a missing confidence says "Confidence not given" and is never shown as 0%.
- Accept means "I agree this is an issue"; Dismiss means "not an issue". Both are undoable. Comments never count as a decision.
- Dismissed findings fade in the text (dotted underline), unless another finding still covers the same words.
- Repaired and unresolved anchors are explained on the card. For unresolved ones the agent's quote is shown, so the reviewer can still judge the finding.
- Findings with no place in the text sit in an "About the whole document" section.
- Half-typed comments are kept in the store, so closing a card never loses them. Escape inside a comment box does not close the card.
- Clicks inside a card never reach the document's click handler (it would clear the selection).

## Step 5: focus, overview, navigation
- **Filters:** severity, status, category. OR inside a group, AND between groups. The severity and status chips double as the risk overview (they show counts); categories are listed with counts in the menu.
- **The selected finding stays visible** even if it stops matching the filters (for example after Accept while "Pending" is on), so its Undo button never disappears under the reviewer's mouse. It drops out when they move on.
- **Hidden findings lose their highlight and card**, so the page shows only what is being looked at.
- **Next / Previous unresolved:** walks the visible findings, skips decided ones, wraps around. Default order: all High, then Medium, then Low, and top to bottom inside each. A switch gives plain document order.
- **Mini-map:** one tick per visible finding (wider = more severe, faded = decided) plus a "you are here" window. A pointer shortcut; keyboard users use Previous / Next.
- **Scrolling (two-way sync):** since a card sits in the same row as its text, a click only makes sure the other half is on screen (`nearest`). Next / Previous / mini-map jump the row to the top, below the fixed bars. Smooth scrolling is turned off for "reduce motion".
- **Fixed top area:** its height is measured and used as scroll padding, so a scrolled-to row never hides under it.
- Rows decide visibility for themselves, from plain strings, so a filter change re-renders only rows whose own answer changed.

## Lesson from testing Step 5 by hand
- First version ordered Next by severity, then by *confidence*. With the real data that made the page hop up and down the contract (High: 9.2 → 4.4 → 8.2 → 3.4 → 6.2 ...), and it felt random. Confidence says nothing about where a clause is. Now: severity tiers, document order inside each tier, plus a "Document order" switch. Locked in by tests that use the real severities and sections.
- Chips and checkboxes carry an explicit spoken name ("High, 3 findings") so screen readers never read "High3".

## Step 6: finish, saving, reset
- **Saving:** localStorage, key = `docreview:v1:<documentId>:<agent name>@<agent version>`. A new agent run may number findings differently, so old decisions must never be applied to it. Saved: decisions, comments, finishedAt. Not saved: filters, selection, half-typed comments, anything calculated.
- **Saved data is never trusted:** parsed defensively; unknown finding ids, bad decision values, malformed comments and bad dates are dropped. Corrupt JSON = start fresh. Missing/blocked/full storage = the app works, shows a "Not saved" chip, and the summary says to download before leaving.
- **Empty results never overwrite a saved review** (found while thinking about the `?empty=1` demo: it would have wiped real work).
- **Finish review** opens a summary (native `<dialog>` + `showModal`: focus trap, Escape, inert page, focus return for free). It warns about undecided findings (with a High count) but lets the reviewer finish anyway: forcing 100% would push people to dismiss things just to finish. Finished = an explicit action. Changing any decision afterwards re-opens the review, because the summary the reviewer approved is out of date.
- The top-bar button becomes the primary action ("All reviewed: finish") when nothing is left, so "know when you're done" is visible without opening anything.
- **Summary export:** Markdown download (decisions, suggested changes, comments, undecided list). Pure function in `domain/summary.ts`, tested on the real data.
- **Reset:** two-step inline confirm inside the dialog; clears decisions, comments, drafts, finished state and the saved copy.
- Assumption: two tabs on the same review = last write wins (no `storage` event sync).
- Dialog checked in a real browser (Safari, by the author) and in Chromium; see Step 7 for the layout fixes that came out of it.

## Step 7: polish and accessibility
- **Contrast audit (computed, not eyeballed):** every text/background pair in the tokens passes 4.5:1 (lowest: muted text on the page background, 5.9:1). One real failure: control borders (filter chips, secondary buttons, comment box) were 1.7:1; `--color-border-strong` is now `#858d9d` (3.3:1, WCAG 1.4.11). Card borders stay light on purpose: the card header's text and open/closed state identify it, the border is decoration.
- **Keyboard shortcuts:** `j` / `k` next / previous unresolved, `a` accept, `d` dismiss, `u` undo. Single letters are risky, so they are ignored while typing, with Ctrl/Cmd/Alt held, while a dialog is open, and (for a/d/u) when nothing is open. No auto-advance after a decision: predictable beat fast (rejected: auto-advance). Listed in a "Shortcuts" menu and exposed on the buttons with `aria-keyshortcuts`. Arrow keys are not used because they scroll the page.
- **Focus follows keyboard navigation:** after `j`/`k` focus moves to the opened card (a screen reader reads it). After the Next *button*, focus stays on the button (so Enter, Enter, Enter keeps working) and a live region announces "Finding 3 of 12: High severity. Title".
- **Live region (`Announcer`):** confirms Accept / Dismiss / Undo with progress, and a reset. One polite status line; alternates a zero-width character so an identical message can be announced twice.
- **Bug found by the tests:** Accept / Dismiss / Undo shared one DOM `<button>` (React reused it), so after Undo, keyboard focus sat on a button that had become "Dismiss". The branches now have their own keys, and focus is handed to the replacement button when the pressed one disappears.
- **Smaller a11y fixes:** the skip-link target can take focus (`tabIndex=-1`); paragraph rows are `div`s, not 24+ unlabeled `article`s.
- **Layout fixes from real screenshots:** the top bar wrapped onto two rows (the title block refused to shrink); the dialog footer's buttons sat left-aligned on a second line. Narrow screens (<62rem): filter chips fold behind a "Filters · N" toggle that shows how many are active, the subtitle is one line, Shortcuts hides below 40rem. The fixed top area went from about 32% to 23% of a 683px-wide screen.
- **Export:** a suggested change is a fragment ("labor strikes affecting an entire industry"), so the summary now prints the text it replaces next to it, only when the location was verified. Cross-paragraph findings say "Clauses 3.4–3.5", not "Clause 3.4".
- **Verified in Chromium (Playwright) at 1050px and 683px:** layout, keyboard flow, dialog focus return, no horizontal scroll. Not tested: Firefox, a real screen reader (VoiceOver / NVDA).

## Step 8: diff view with full-sentence preview
- **Why:** a suggested edit is a fragment ("labor strikes affecting an entire industry"). It hides the seams. So each card now shows the change *as a redline inside the full sentence it would change* (struck-through old words, underlined new words).
- **Redline only (decision):** an earlier version also had a "Result" (clean sentence) toggle. Cut it: the redline already contains both texts, two views meant one more control and one more thing to test, and reviewers read the redline anyway. The clean "after" sentence still exists in the Markdown export ("Reads after the change").
- **Pure domain code (`domain/diff.ts`):** word-level diff + sentence finder + preview builder. Nothing is stored; the original document is never touched (tested).
- **Diff:** LCS over tokens. Whitespace is its own token, so both sides rebuild *exactly* (a random test proves it). Found by the real data: with spaces glued to words, f-15 would have read "Deliverablesduring the term". Two cleanups make it readable: a lone "(" or "the" stuck between two changes is folded into the change (no confetti), and a mostly rewritten sentence (under 30% shared words) is shown as one old block, one new block. Past ~700 tokens a side it falls back to one block instead of freezing.
- **Sentence finder:** a sentence ends at . ! ? (plus closing quote/bracket) followed by a space and a non-lowercase letter, except after known abbreviations (Inc., No., Sec., e.g., initials). "Section 7.2." works because the dot is followed by a digit.
- **What the full sentence showed that the fragment hid:** f-14's edit ends in a comma and the text after it starts with one (",,"); f-05's edit starts a new sentence in the middle of one; f-06's edit leaves the list "…Section 7.2, losses, damages…" reading oddly. The first two are caught by cheap seam checks ("Check the join"); the third only a human can judge, which is exactly why the sentence is shown. Test: only f-05 and f-14 warn, so the checks do not cry wolf.
- **Cross-paragraph (f-02):** removed text of 3.4 and 3.5 (with a ¶ marker), then the new text. No word diff across a paragraph break (it would mislead). Said plainly on the card: preview only. `editable` is now false for any change that spans more than one paragraph, because applying it would merge two clauses.
- **Approximate location (f-20):** only the replaced words, with a reason. Never claims a sentence we are not sure about.
- **No place in the text (unresolved, whole-document):** the plain suggestion plus a one-line reason.
- **Accessibility:** removed = strikethrough, added = underline (not colour alone); screen readers hear "Removed:" / "Added:". Colours are tokens with computed contrast (removed 6.3:1, added 6.7:1).
- **Export:** "Original text" now comes from the *document*, not the agent's quote (they differ when a location was repaired), and exact findings also print "Reads after the change" (the full sentence).
- **Small hardening:** the summary download revokes its object URL after a second, not in the same tick (can cancel the download in some Safari versions).
- Not verified: a real screen reader, Firefox, and the card layout in a very long sentence on a phone (longest sentence in the data is 386 characters).
- **Whole-document findings:** no heading or explanation line above the document any more. Each such card says "Whole document" itself (a chip), and a visually hidden heading keeps the landmark for screen-reader users. Rejected: moving them to the bottom (a missing security clause is exactly what a reviewer should see first).

## Step 9: apply edits with a redline
- **Rule (D4) kept:** the original contract never changes. The store keeps only `applied: string[]` (finding ids, in the order applied). The redline, the revised text and the conflicts are calculated (`domain/edits.ts`). A test proves the contract object is untouched.
- **Who can be applied:** `finding.editable` only: exact anchor, one paragraph, has a suggestion. Repaired (f-20) and cross-paragraph (f-02) stay preview-only, and the card says why. A suggestion identical to the current words is not applicable either.
- **Apply means accept:** one button, "Accept & apply edit". Invariant, enforced in `decide`, in `applyEdit` and when loading saved data: *every applied id is accepted, editable, and overlaps no other applied id*. Dismissing or undoing a finding removes its edit; "Revert edit" removes only the edit (the finding stays accepted). Rejected: a separate "Apply" step that needed Accept first (two clicks for one idea).
- **Conflict block:** two applied edits may not share any anchored words. Real data: f-04 / f-05 on 6.2 is the only conflicting pair of the 17 editable findings. The second Apply button is disabled and the card names the finding in the way. Touching ranges are fine. The check uses the whole anchor (not only the replaced words): simpler, needs no text, and strict on the safe side.
- **Offsets always refer to the ORIGINAL text.** That is why f-13 and f-22 (both in 4.3) can both be applied: neither edit shifts the other's position. The redline is the original pieces plus the new words, never a rewritten string.
- **Document view:** replaced words are struck through (`<del>`), new words follow underlined (`<ins>`); both carry `data-finding-ids`, so clicking either selects the finding. Highlights inside struck text keep working (f-05 inside f-04's struck range). Applied edits stay on screen when a filter hides their finding: they are part of the draft, not an annotation. Screen readers hear "Removed:" once per edit and "Added:".
- **Known limit:** the document shows the whole anchored span struck and the whole replacement; the card shows the word-level diff. For long anchors (f-08 strikes 118 characters to change a few words) the card is easier to read. Option for later: draw the word diff inside the span.
- **Seam warnings do not block applying** (f-05, f-14): they are a prompt to look, and a human may well want the edit and then fix the comma.
- **Summary / export:** counts applied edits, marks them in the list, and the Markdown gives the whole clause as it reads after all applied edits ("The clause now reads: ...").
- **Saved with the review:** `applied` is saved next to decisions. Older saves without it still load. On load, every id goes through `sanitizeApplied`.
- **Also changed:** adding a comment after "Finish review" now re-opens the review, like a changed decision does (the summary includes comments, so it was out of date). Focus goes to "Revert edit" after Apply (and to Apply after Revert), and an applied finding's Undo button has a longer accessible name so nobody undoes an edit by surprise.

## Performance: what was measured (domain logic only, Node 22, not a browser)
| Size | buildReviewModel | redlineSegments, all paragraphs | sanitizeApplied |
|---|---|---|---|
| 42 paragraphs / 24 findings (real) | 11 ms | 0.5 ms | 0.3 ms |
| 2,100 / 1,200 | 72 ms | 5 ms | 0.9 ms |
| 10,500 / 6,000 | 308 ms | 30 ms | 12 ms |
- The benchmark found a real problem in my own new code: `sanitizeApplied` compared every candidate with every kept edit (about 1 s at 6,000 findings). It now compares only within a paragraph (12 ms).
- **Not measured:** rendering. At 10,000 rows the cost is the DOM, not these functions. Next steps in order: `content-visibility: auto` on rows (cheap, keeps the margin-card layout), then windowing (hard here: row heights depend on open cards).
- **Known cost to fix before scaling:** half-typed comments live in the main store, so every keystroke runs every row's selectors. Fine at 42 rows; at 10,000 move drafts into their own tiny store.
