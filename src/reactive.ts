export interface Reactive<T> {
  subscribe(listener: Listener<T>): Unsubscriber;
  getState(): T;
}

export function rsubject<T>(state: T) {
  return new ReactiveSubject(state);
}

export function rmap<A, B>(source: Reactive<A>, mapper: (sourceValue: A) => B) {
  return new ReactiveMap(source, mapper);
}

export function rscan<A, B>(
  source: Reactive<A>,
  scanner: (state: B, sourceValue: A) => B,
  initial: B
) {
  return new ReactiveScan(source, scanner, initial);
}

export function rjoin<T extends any[]>(
  sources: { [K in keyof T]: Reactive<T[K]> }
) {
  return new ReactiveJoin(sources);
}

type Listener<T> = (value: T) => void;
type Unsubscriber = () => void;
type Subscription<T> = { listener: Listener<T> };

class ReactiveSubject<T> implements Reactive<T> {
  constructor(private state: T) {}
  private readonly subscriptions = new Set<Subscription<T>>();
  public publish(value: T) {
    if (value === this.state) return;
    for (const { listener } of this.subscriptions) {
      listener(value);
    }
    this.state = value;
  }
  public subscribe(listener: Listener<T>) {
    const subscription = { listener };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }
  public getState() {
    return this.state;
  }
}

const emptyState = Symbol("empty");

class ReactiveMap<A, B> implements Reactive<B> {
  constructor(
    private readonly source: Reactive<A>,
    private readonly mapper: (sourceValue: A) => B
  ) {}
  private state: B | typeof emptyState = emptyState;
  private sourceUnsubscriber: Unsubscriber | null = null;
  private readonly subscriptions = new Set<Subscription<B>>();
  public subscribe(listener: Listener<B>) {
    const subscription = { listener };
    this.subscriptions.add(subscription);
    this.subscribeSource();
    return () => {
      this.subscriptions.delete(subscription);
      this.unsubscribeSource();
    };
  }
  getState() {
    if (this.state === emptyState) {
      this.state = this.mapper(this.source.getState());
    }
    return this.state;
  }
  private update = (value: A) => {
    const newState = this.mapper(value);
    if (newState === this.state) return;
    for (const { listener } of this.subscriptions) {
      listener(newState);
    }
    this.state = newState;
  };
  private subscribeSource() {
    if (this.sourceUnsubscriber !== null) {
      this.sourceUnsubscriber = this.source.subscribe(this.update);
    }
  }
  private unsubscribeSource() {
    if (!this.subscriptions.size && this.sourceUnsubscriber) {
      this.sourceUnsubscriber();
      this.sourceUnsubscriber = null;
    }
  }
}

class ReactiveScan<A, B> implements Reactive<B> {
  constructor(
    private readonly source: Reactive<A>,
    private readonly scanner: (state: B, sourceValue: A) => B,
    private readonly initial: B
  ) {}
  private buffer: A[] = [];
  private state: B = this.initial;
  private sourceUnsubscriber: Unsubscriber | null = null;
  private readonly subscriptions = new Set<Subscription<B>>();
  public subscribe(listener: Listener<B>) {
    const subscription = { listener };
    this.subscriptions.add(subscription);
    this.subscribeSource();
    return () => {
      this.subscriptions.delete(subscription);
      this.unsubscribeSource();
    };
  }
  getState() {
    if (this.buffer.length > 0) {
      this.state = this.buffer.reduce(this.scanner, this.state);
      this.buffer = [];
    }
    return this.state;
  }
  private update = (value: A) => {
    if (this.subscriptions.size > 0) {
      this.buffer.push(value);
      const newState = this.buffer.reduce(this.scanner, this.state);
      if (newState === this.state) return;
      for (const { listener } of this.subscriptions) {
        listener(newState);
      }
      this.state = newState;
      this.buffer = [];
    } else {
      this.buffer.push(value);
    }
  };
  private subscribeSource() {
    if (this.sourceUnsubscriber !== null) {
      this.sourceUnsubscriber = this.source.subscribe(this.update);
    }
  }
  private unsubscribeSource() {
    if (!this.subscriptions.size && this.sourceUnsubscriber) {
      this.sourceUnsubscriber();
      this.sourceUnsubscriber = null;
    }
  }
}

class ReactiveJoin<T extends any[]> implements Reactive<T> {
  constructor(private readonly sources: { [K in keyof T]: Reactive<T[K]> }) {}
  getState() {
    return this.sources.map(source => source.getState()) as T;
  }
  private sourceUnsubscribers: Unsubscriber[] | null = null;
  private readonly subscriptions = new Set<Subscription<T>>();
  public subscribe(listener: Listener<T>) {
    const subscription = { listener };
    this.subscriptions.add(subscription);
    this.subscribeSource();
    return () => {
      this.subscriptions.delete(subscription);
      this.unsubscribeSource();
    };
  }
  private update = () => {
    const state = this.getState();
    for (const { listener } of this.subscriptions) {
      listener(state);
    }
  };
  private subscribeSource() {
    if (this.sourceUnsubscribers !== null) {
      this.sourceUnsubscribers = this.sources.map(source =>
        source.subscribe(this.update)
      );
    }
  }
  private unsubscribeSource() {
    if (!this.subscriptions.size && this.sourceUnsubscribers) {
      for (const unsubscriber of this.sourceUnsubscribers) {
        unsubscriber();
      }
      this.sourceUnsubscribers = null;
    }
  }
}
