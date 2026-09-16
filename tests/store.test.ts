import { describe, it, expect, vi } from 'vitest';
import { createStore } from '../src/state/store';

describe('createStore', () => {
  it('returns the initial state', () => {
    const store = createStore({ a: 1, b: 'x' });
    expect(store.get()).toEqual({ a: 1, b: 'x' });
  });

  it('merges patches and notifies subscribers once per set', () => {
    const store = createStore({ a: 1, b: 'x' });
    const spy = vi.fn();
    store.subscribe(spy);
    store.set({ a: 2 });
    expect(store.get().a).toBe(2);
    expect(store.get().b).toBe('x');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({ a: 2, b: 'x' });
  });

  it('stops notifying after unsubscribe', () => {
    const store = createStore({ a: 1 });
    const spy = vi.fn();
    const off = store.subscribe(spy);
    off();
    store.set({ a: 3 });
    expect(spy).not.toHaveBeenCalled();
  });

  it('replaces the state object identity so UI can diff by reference', () => {
    const store = createStore({ a: 1 });
    const before = store.get();
    store.set({ a: 2 });
    expect(store.get()).not.toBe(before);
  });
});
