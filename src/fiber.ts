function Cell() {
  return { initialized: false, state: null, next: null as any };
}

type CellFunction = <State, Initial>(
  callback: (state: State | Initial) => State,
  init: () => Initial
) => State;

type Fiber<Action, Return> = (action: Action, cell: CellFunction) => Return;

export function fiberRunner<Action, Return>(fiber: Fiber<Action, Return>) {
  let rootCell = Cell();
  let currentCell = rootCell;
  function cell(callback: (state: any) => any, init: () => any) {
    if (!currentCell.initialized) {
      currentCell.initialized = true;
      currentCell.state = init();
      currentCell.next = Cell();
    }
    const newState = callback(currentCell.state);
    currentCell.state = newState;
    currentCell = currentCell.next;
    return newState;
  }
  return (action: Action) => {
    const result = fiber(action, cell);
    currentCell = rootCell;
    return result;
  };
}

export function fiberLoop<Action, Return>(
  fiberWithDispatch: (
    action: Action,
    cell: <State>(
      callback: (state: State) => State,
      init: () => State
    ) => State,
    dispatch: (action: Action) => void
  ) => Return,
  init: Action
) {
  const queue: Action[] = [];
  let scheduled: Promise<void> | null = null;
  function dispatch(action: Action) {
    queue.push(action);
    if (!scheduled) {
      scheduled = Promise.resolve().then(run);
    }
  }
  function run() {
    while (queue.length > 0) {
      const action = queue.shift() as Action;
      const result = runner(action);
      publish([action, result]);
    }
    scheduled = null;
  }
  const fiber: Fiber<Action, Return> = (action, cell) =>
    fiberWithDispatch(action, cell, dispatch);
  const runner = fiberRunner(fiber);
  const [state, subscribe, publish] = subjectStateful<[Action, Return]>([
    init,
    runner(init)
  ]);
  return { dispatch, subscribe, state };
}

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

function shallowCompareArray(a: unknown, b: unknown): boolean {
  if (!(a instanceof Array) || !(b instanceof Array)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function subject<T>() {
  type Listener = (event: T) => void;
  type Subscription = { listener: Listener };
  const subscriptions = new Set<Subscription>();
  function subscribe(listener: Listener) {
    const subscription = { listener };
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  }
  function publish(event: T) {
    for (const { listener } of subscriptions) {
      listener(event);
    }
  }
  return [subscribe, publish] as const;
}

function subjectStateful<T>(initial: T) {
  type Listener = (event: T) => void;
  type Subscription = { listener: Listener };
  const subscriptions = new Set<Subscription>();
  let currentState = initial;
  function subscribe(listener: Listener) {
    const subscription = { listener };
    subscriptions.add(subscription);
    return () => {
      subscriptions.delete(subscription);
    };
  }
  function publish(event: T) {
    currentState = event;
    for (const { listener } of subscriptions) {
      listener(event);
    }
  }
  function state() {
    return currentState;
  }
  return [state, subscribe, publish] as const;
}
