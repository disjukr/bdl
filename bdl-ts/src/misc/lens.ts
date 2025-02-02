export interface Lens<T, U> {
  _<K extends keyof U>(key: K): Lens<T, U[K]>;
  compose<V>(other: Lens<U, V>): Lens<T, V>;
  get(target: T): U;
  set(value: U): (target: T) => T;
}

export function lens<T>(): Lens<T, T>;
export function lens<T, U>(
  getter: (target: T) => U,
  setter: (value: U) => (target: T) => T,
): Lens<T, U>;
export function lens() {
  if (arguments.length) return _lens(arguments[0], arguments[1]);
  return _lens((t) => t, (v) => (_) => v);
}

function _lens<T, U>(
  get: (target: T) => U,
  set: (value: U) => (target: T) => T,
): Lens<T, U> {
  return {
    get,
    set,
    _(key) {
      return this.compose(lens(
        (t) => t[key],
        (v) => (t) => {
          const n: any = Array.isArray(t) ? t.slice() : { ...t };
          n[key] = v;
          return n;
        },
      ));
    },
    compose(other) {
      return lens(
        (t) => other.get(get(t)),
        (v) => (t) => set(other.set(v)(get(t)))(t),
      );
    },
  };
}
