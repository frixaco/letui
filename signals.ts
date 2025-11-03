export type Signal<T> = {
  (): T;
  (next: T): void;
};
export type ReadonlySignal<T> = () => T;
export type Sub = () => void;

let caller: null | Sub = null;

let scheduled = new Set<Sub>();
let flushing = false;

function schedule(fn: Sub) {
  scheduled.add(fn);

  if (flushing) return;

  flushing = true;
  queueMicrotask(() => {
    try {
      while (scheduled.size) {
        const snapshot = Array.from(scheduled);
        scheduled.clear();
        for (let s of snapshot) s();
      }
    } finally {
      flushing = false;
    }
  });
}

export function $<T>(defaultValue: T): Signal<T> {
  let v: T = defaultValue;
  let subs = new Set<Sub>();

  function $$(): T;
  function $$(next: T): void;

  function $$(next?: T): T | void {
    if (arguments.length === 0) {
      if (caller) subs.add(caller);
      return v;
    }

    let newV = next as T;
    if (Object.is(v, newV)) return;
    v = newV;

    for (let s of subs) schedule(s);
  }

  return $$;
}

export function dd<T>(fn: () => T): ReadonlySignal<T> {
  let v: T;
  let initialized = false;
  let subs = new Set<Sub>();

  let recompute = () => {
    let prev = caller;
    let newV: T;

    try {
      caller = recompute;
      newV = fn();
    } finally {
      caller = prev;
    }

    if (!initialized || !Object.is(v, newV)) {
      v = newV;
      initialized = true;
      for (const s of subs) schedule(s);
    }

    return v;
  };

  v = recompute();

  function $$(): T {
    if (caller) subs.add(caller);
    return v;
  }

  return $$;
}

export function ff(fn: Sub): void {
  let prev = caller;
  try {
    caller = fn;
    fn();
  } finally {
    caller = prev;
  }
}

export function af<T>(srcOrFn: () => Promise<T | null>): {
  data: Signal<T | null>;
  loading: Signal<boolean>;
};
export function af<T>(
  srcOrFn: Signal<T>,
  fn: (src: T) => Promise<T | null>,
): {
  data: Signal<T | null>;
  loading: Signal<boolean>;
};

export function af<T>(
  srcOrFn: Signal<T> | (() => Promise<T | null>),
  fn?: (src: T) => Promise<T | null>,
): {
  data: Signal<T | null>;
  loading: Signal<boolean>;
} {
  let data = $<T | null>(null);
  let loading = $(false);
  let ctrl: AbortController | null = null;

  async function fetchData(src?: T): Promise<void> {
    ctrl?.abort();
    ctrl = new AbortController();

    let currentCtrl = ctrl;

    loading(true);

    try {
      let v: T | null = null;
      if (fn && src !== undefined) {
        v = await fn(src);
      } else {
        v = await srcOrFn();
      }

      if (currentCtrl.signal.aborted) return;

      data(v);
    } finally {
      if (!currentCtrl.signal.aborted) {
        loading(false);
      }
    }
  }

  ff(() => {
    if (!fn) {
      fetchData();
      return;
    }

    fetchData((srcOrFn as Signal<T>)());
  });

  return {
    data,
    loading,
  };
}

// const counter = $(0);

// const { data, loading } = af(counter, async (c) => {
//   console.log("--- async effect running");
//   await wait();
//   return c + 100;
// });
//
// ff(() => {
//   console.log(`loading: ${loading()} data: ${data()}`);
// });

// ff(() => {
//   console.log(counter());
// });
//
// counter(1);
// console.log("first set called");
//
// counter(2);
// console.log("second set called");

export function wait(ms: number = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// const doubleCounter = dd(() => counter.get() * 2);
//
// ff(() => {
//   console.log("fc", counter.get() + 1); // prints 1 first time, 2 second time
// });
//
// counter.set(1);
// await Promise.resolve();
// console.log("dc", doubleCounter.get()); // prints 2 cause of line above

// Output:
// ❯ bun run component-api.ts
// fc 1
// fc 2
// dc 2
