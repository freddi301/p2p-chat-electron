import { any } from "prop-types";

type Cell = { initialized: boolean; state: any; next: any };

export function Cell(): Cell {
  return { initialized: false, state: null, next: null };
}

export type CellFunction = <State, Initial>(
  callback: (state: State | Initial) => State,
  init: () => Initial
) => State;

export type CellFunctionTypeIntance<State, Initial> = (
  callback: (state: State | Initial) => State,
  init: () => Initial
) => State;

export type Fiber<Action, Return> = (
  action: Action,
  cell: CellFunction
) => Return;

export function makeFiber<Action, Return>(fiber: Fiber<Action, Return>) {
  return fiber;
}

export function fiberRunner<Action, Return>(
  fiber: Fiber<Action, Return>,
  rootCell: Cell
) {
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
  const next = (action: Action) => {
    const result = fiber(action, cell);
    currentCell = rootCell;
    return result;
  };
  return next;
}

export function runFiber<Action, Return>(
  fiber: Fiber<Action, Return>,
  rootCell: Cell,
  action: Action
) {
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
  const result = fiber(action, cell);
  return result;
}

export function cloneCell(original: Cell | null): Cell {
  if (!original) {
    return (null as any) as Cell;
  }
  const cloned = Cell();
  cloned.initialized = original.initialized;
  cloned.state = original.state;
  cloned.next = cloneCell(original.next);
  return cloned;
}
