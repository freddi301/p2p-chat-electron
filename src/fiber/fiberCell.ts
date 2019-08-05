import { CellFunction, CellFunctionTypeIntance } from "./fiber";

export function memo<T, D>(
  cell: CellFunction,
  callback: () => T,
  deps: D,
  compare: (prev: D, next: D) => boolean = shallowCompareArray
) {
  const [memoized] = cell<[T, D], null>(
    state => {
      if (state !== null) {
        const [memoized, lastDeps] = state;
        if (compare(lastDeps, deps)) {
          return [memoized, deps];
        }
      }
      return [callback(), deps];
    },
    () => null
  );
  return memoized;
}

export function effect<D>(
  cell: CellFunction,
  callback: () => () => void,
  deps: D,
  compare: (prev: D, next: D) => boolean = shallowCompareArray
) {
  cell<[() => void, D], null>(
    state => {
      if (state === null) {
        return [callback(), deps];
      } else {
        const [teardown, lastDeps] = state;
        if (compare(lastDeps, deps)) {
          return [teardown, deps];
        } else {
          teardown();
          return [callback(), deps];
        }
      }
    },
    () => null
  );
}

export function ref<T>(cell: CellFunctionTypeIntance<T, T>, callback: () => T) {
  return cell(x => x, callback);
}

function shallowCompareArray(a: unknown, b: unknown): boolean {
  if (!(a instanceof Array) || !(b instanceof Array)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}
