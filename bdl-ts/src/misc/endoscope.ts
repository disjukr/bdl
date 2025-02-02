import { type Lens, lens } from "./lens.ts";

export interface Endoscope<T, U> {
  target: T;
  lens: Lens<T, U>;
  _<K extends keyof U>(key: K): Endoscope<T, U[K]>;
  get(): U;
  set(value: U): Endoscope<T, U>;
}

export function endoscope<T>(target: T): Endoscope<T, T> {
  return _endoscope(target, lens());
}
function _endoscope<T, U>(target: T, _lens: Lens<T, U>): Endoscope<T, U> {
  return {
    target,
    lens: _lens,
    _: (key) => _endoscope(target, _lens._(key)),
    get: () => _lens.get(target),
    set: (value) => _endoscope(_lens.set(value)(target), _lens),
  };
}
