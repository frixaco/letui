---
title: "Building a TUI Library from scratch using Bun and Rust: Part 2"
description: "Rewriting everything with signals-based reactivity, functional components, better API and more"
date: "2025-12-13T10:00:00"
---

## Building a TUI Library from Scratch: Part 2

#### Things I learned:

- Signals are simple but powerful - auto-tracking dependencies changes everything
- Separating layout from painting makes the code so much cleaner
- Pure functions returning data structures beat classes with internal state

As a small fan of SolidJS, I decided to try out a signals approach and implement the base primitives from scratch. A signal is deceptively simple - a function that tracks its subscribers and schedules updates when values change:

```typescript
export function $<T>(defaultValue: T): Signal<T> {
  let v: T = defaultValue;
  let subs = new Set<Sub>();

  function $$(next?: T): T | void {
    if (arguments.length === 0) {
      if (caller) subs.add(caller); // auto-subscribe on read
      return v;
    }
    if (Object.is(v, next)) return;
    v = next as T;
    for (let s of subs) schedule(s); // notify all subscribers
  }
  return $$;
}
```

With signals in place, components became pure functions returning `Node` objects. No classes, no internal state - just data structures describing what to render. The `run()` function handles the entire lifecycle: layout calculation (offloaded to Rust via `taffy`), painting to the buffer, and event handling. When any signal changes (either internally or externally), the effect function re-runs and the UI updates automatically. Boom!

```typescript
export function Button(props: ButtonProps & { id: string }): Node {
  return {
    id: props.id,
    type: "button",
    props,
    frame: getInitialFrame(),
    children: [],
  };
}

// Usage: reactive text that updates automatically
let buttonText = $("Click me");
Button({ id: "btn", text: buttonText, onClick: () => buttonText("Clicked!") });
```

Designing an actual architecture paid off. Layout and painting are now separate concerns - Rust calculates coordinates, TypeScript paints to the buffer. Mouse and keyboard events flow through a spatial lookup table. Most importantly, derived state with `dd()` and async effects with `af()` compose naturally. What started as 700+ lines of class-based spaghetti became a clean separation: ~60 lines of signal primitives driving a declarative component tree.

#### The layout engine rabbit hole

I started adding layout calculations for `Column` and `Row` - nothing fancy, just positioning children correctly. Then I needed to handle flex and fixed components. Then coordinate conversions. Then gap calculations. Then nested containers...

At some point I stepped back and realized: I was basically writing a layout engine from scratch without knowing it. Every fix introduced two new edge cases. After a few late nights debugging why my rows weren't aligning properly, I had a moment of clarity: this is completely out of scope.

So I reached for [`taffy`](https://github.com/DioxusLabs/taffy) - a Rust layout library that implements flexbox. One integration later and all my layout headaches disappeared. The lesson? Know when something deserves its own library or is out of scope. I'm building a TUI framework, not a layout engine.

#### The key insight

When you stop fighting the data flow and let reactivity handle updates, everything becomes easier. Instead of manually calling `setText()` and `prerender()` and `render()`, you just update a signal. The system figures out what needs to change. Now the library became somewhat usable. I even re-wrote my Anitrack TUI project using LeTUI.

At this point I decided it's time to do some optimizations and add some more features.

#### Clipping

One feature I had to implement that was relatively simple but interesting was clipping. When you have a container with fixed dimensions, child content shouldn't overflow and bleed into surrounding components. Content (e.g. text) that's too long needs to be cut off at the component boundary.

This meant during painting I had to track each container's bounds and skip any pixels that fall outside. For text, I also added wrapping support - if a line is too long, break it and continue on the next line (but only within the container's height). Simple in concept, but getting the edge cases right took some debugging.
