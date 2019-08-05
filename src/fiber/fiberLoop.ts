import { Fiber, fiberRunner, Cell } from "./fiber";

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
  const rootCell = Cell();
  const runner = fiberRunner(fiber, rootCell);
  const [state, subscribe, publish] = subjectStateful<[Action, Return]>([
    init,
    runner(init)
  ]);
  return { dispatch, subscribe, state };
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
// function subject<T>() {
//   type Listener = (event: T) => void;
//   type Subscription = { listener: Listener };
//   const subscriptions = new Set<Subscription>();
//   function subscribe(listener: Listener) {
//     const subscription = { listener };
//     subscriptions.add(subscription);
//     return () => {
//       subscriptions.delete(subscription);
//     };
//   }
//   function publish(event: T) {
//     for (const { listener } of subscriptions) {
//       listener(event);
//     }
//   }
//   return [subscribe, publish] as const;
// }
