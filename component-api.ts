let caller: null | (() => void) = null;

let scheduled = new Set<() => void>();
let flushing = false;

function schedule(fn: () => void) {
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

export function $<T>(defaultValue: T) {
  let v: T = defaultValue;
  let subs = new Set<() => void>();

  return {
    get() {
      if (caller) subs.add(caller);
      return v;
    },
    set(newValue: T) {
      v = newValue;

      for (let s of subs) schedule(s);
    },
  };
}

export function dd<T>(fn: () => T) {
  let v: T;
  let subs = new Set<() => void>();

  let recompute = () => {
    let prev = caller;

    try {
      caller = recompute;

      let newV = fn();
      caller = prev;

      v = newV;

      for (const s of subs) schedule(s);

      return v;
    } finally {
      caller = prev;
    }
  };

  v = recompute();

  return {
    get() {
      if (caller) subs.add(caller);
      return v;
    },
  };
}

export function ff(fn: () => void) {
  let prev = caller;
  try {
    caller = fn;
    fn();
  } finally {
    caller = prev;
  }
}

let currentCtrl: AbortController | null = null;

export function af<T, S = undefined>(
  srcOrFn: S extends undefined ? () => Promise<T | null> : () => S,
  fn?: (src: S) => Promise<T | null>,
) {
  let data = $<T | null>(null);
  let loading = $(false);

  async function fetchData(src?: S): Promise<undefined> {
    let ctrl = new AbortController();
    currentCtrl?.abort();
    currentCtrl = ctrl;

    loading.set(true);

    try {
      let v: T | null = null;
      if (fn && src !== undefined) {
        v = await fn(src);
      } else {
        v = await (srcOrFn as () => Promise<T | null>)();
      }

      if (ctrl.signal.aborted) return;

      data.set(v);
    } finally {
      loading.set(false);
    }
  }

  ff(() => {
    if (!fn) {
      fetchData();
    } else {
      const v = srcOrFn() as S;
      fetchData(v);
    }
  });

  return {
    data,
    loading,
  };
}

// const counter = $(0);

// const { data, loading } = af(
//   () => counter.get(),
//   async (c) => {
//     console.log("async effect");
//     await wait();
//     return c + 100;
//   },
// );

// ff(() => {
//   console.log("==========");
//   console.log(data.get());
//   console.log(loading.get());
//   console.log("==========");
// });
//
// counter.set(1);
// await Promise.resolve();
// await wait(600);
// console.log("first fetch done");
//
// counter.set(2);
// await Promise.resolve();
// await wait(600);
// console.log("second fetch done");
//
// function wait(ms: number = 1000) {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }

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
