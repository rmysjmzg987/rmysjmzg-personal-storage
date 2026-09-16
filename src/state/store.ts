export interface Store<T extends object> {
  get(): Readonly<T>;
  set(patch: Partial<T>): void;
  subscribe(fn: (state: Readonly<T>) => void): () => void;
}

export function createStore<T extends object>(initial: T): Store<T> {
  let state: T = { ...initial };
  const listeners = new Set<(state: Readonly<T>) => void>();

  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const fn of listeners) fn(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
