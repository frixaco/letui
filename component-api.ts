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

function $<T>(defaultValue: T) {
  let v: T = defaultValue;
  let subs = new Set<() => void>();

  return {
    get() {
      if (caller) subs.add(caller);
      return v;
    },
    set(newValue: any) {
      v = newValue;

      for (let s of subs) schedule(s);
    },
  };
}

function dd<T>(fn: () => T) {
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

function ff(fn: () => void) {
  let prev = caller;
  try {
    caller = fn;
    fn();
  } finally {
    caller = prev;
  }
}

const counter = $(0);
const doubleCounter = dd(() => counter.get() * 2);

ff(() => {
  console.log("fc", counter.get() + 1); // prints 1 first time, 2 second time
});

counter.set(1);
await Promise.resolve();
console.log("dc", doubleCounter.get()); // prints 2 cause of line above

// Output:
// ❯ bun run component-api.ts
// fc 1
// fc 2
// dc 2
