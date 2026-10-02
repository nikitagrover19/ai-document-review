// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { shortcutFor, type KeyLike } from './shortcuts';

const key = (k: string, over: Partial<KeyLike> = {}): KeyLike => ({
  key: k, ctrlKey: false, metaKey: false, altKey: false, defaultPrevented: false, target: document.body, ...over,
});
afterEach(() => (document.body.innerHTML = ''));

describe('shortcutFor', () => {
  it('maps the five keys, upper or lower case', () => {
    expect(shortcutFor(key('j'))).toBe('next');
    expect(shortcutFor(key('K'))).toBe('previous');
    expect(shortcutFor(key('a'))).toBe('accept');
    expect(shortcutFor(key('d'))).toBe('dismiss');
    expect(shortcutFor(key('u'))).toBe('undo');
    expect(shortcutFor(key('x'))).toBeNull();
  });
  it('leaves browser and screen-reader shortcuts alone', () => {
    expect(shortcutFor(key('a', { metaKey: true }))).toBeNull(); // select all
    expect(shortcutFor(key('d', { ctrlKey: true }))).toBeNull(); // bookmark
    expect(shortcutFor(key('j', { altKey: true }))).toBeNull();
  });
  it('is off while typing', () => {
    document.body.innerHTML = '<textarea id="t"></textarea><input id="i"><select id="s"></select>';
    for (const id of ['t', 'i', 's']) expect(shortcutFor(key('a', { target: document.getElementById(id) }))).toBeNull();
  });
  it('is off while a dialog is open, and when something already handled the key', () => {
    document.body.innerHTML = '<dialog open></dialog>';
    expect(shortcutFor(key('j'))).toBeNull();
    document.body.innerHTML = '';
    expect(shortcutFor(key('j', { defaultPrevented: true }))).toBeNull();
    expect(shortcutFor(key('j', { isComposing: true }))).toBeNull();
  });
});
