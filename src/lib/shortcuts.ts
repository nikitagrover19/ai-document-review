/**
 * Keyboard shortcuts for working through findings without the mouse.
 *
 *   j  next unresolved        k  previous
 *   a  accept the open one    d  dismiss it        u  undo its decision
 *
 * Single letters are easy to hit by accident, so they only work when nothing else wants the key:
 * not while typing, not with Ctrl / Cmd / Alt held (browser and screen-reader shortcuts), and not
 * while a dialog is open.
 */
export type ShortcutAction = 'next' | 'previous' | 'accept' | 'dismiss' | 'undo';

export const SHORTCUTS: { key: string; action: ShortcutAction; label: string }[] = [
  { key: 'j', action: 'next', label: 'Next unresolved finding' },
  { key: 'k', action: 'previous', label: 'Previous finding' },
  { key: 'a', action: 'accept', label: 'Accept the open finding' },
  { key: 'd', action: 'dismiss', label: 'Dismiss the open finding' },
  { key: 'u', action: 'undo', label: 'Undo the open finding’s decision' },
];

export interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  isComposing?: boolean;
  target: EventTarget | null;
}

const TYPING = 'input, textarea, select, [contenteditable="true"]';

export function shortcutFor(event: KeyLike, root: Document = document): ShortcutAction | null {
  if (event.defaultPrevented || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target as Element | null;
  if (target?.closest?.(TYPING)) return null;
  if (root.querySelector('dialog[open]')) return null;
  return SHORTCUTS.find((s) => s.key === event.key.toLowerCase())?.action ?? null;
}
