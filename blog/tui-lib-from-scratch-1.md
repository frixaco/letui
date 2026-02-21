---
title: "Building a TUI Library from scratch: Part 1"
description: "Initial implementation of my terminal user interface library using Bun, Rust and classes"
date: "2025-12-12T10:00:00"
---

## Building a TUI Library from Scratch: From Classes to Signals

#### Things I learned:

- I learned **tons** of things but had to write **tons** of garbage for it and (of course) ended up using **none** of it
- Separation of concerns is **extremely** important, never stop following this principle
- Bun, FFI, some Rust, ANSI escape sequences, memory management

#### Tools used:

- ampcode.com, aistudio.google.com, t3.chat, deepwiki.com

I've been using Neovim for years and enjoyed living inside my terminal. I was also super interested in different CLIs and TUIs. I got even more curious when I started hearing about Claude Code, Codex, Aider and similar AI agents that run in the terminal (about a year ago I think) more and more. I did some quick research and found [`react-ink`](https://github.com/vadimdemedes/ink), then [`opencode`](https://github.com/sst/opencode). Soon after I saw this post:

> yeah unfortunately the best tooling for TUIs is in go
>
> we'll build OpenTUI one day for js but till then this hack works
>
> — dax (@thdxr), [May 31, 2025](https://twitter.com/thdxr/status/1928902930419048585?ref_src=twsrc%5Etfw)

and right then I decided to build my own TUI library someday.

When I started building `LeTUI` around September, I decided not to follow or copy any tutorial, guide or existing repository. I wanted to build something from scratch, on my own. I did use AI for a general roadmap and learning, but I wrote every single line of code myself.

I reached for the most "simple to reason about" pattern - classes - and wanted to just go with the flow. I never wrote a library or worked with terminals before, so instead of making a detailed step-by-step plan, I decided to just start by playing around with the code.

As the result, initial implementation had `View`, `Row`, `Column`, `Text`, `Button`, and `Input` classes. It was a complete mess, but I learned a lot and it gave me enough of a base to build on later.

Here's an example snippet. Enjoy!

```typescript
class Button {
  id: number;
  px = 4;
  py = 1;
  text: string;
  fg: number;
  active_fg: number;
  bg: number;
  active_bg: number;
  border: Border;
  prebuilt: BigUint64Array = new BigUint64Array();
  width: number;
  height: number;
  onClick: (() => Promise<void>) | (() => void) | null = null;

  // ... constructor and other methods ...

  render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
    this.xo = xo;
    this.yo = yo;

    this.prerender(); // layout? painting? who knows!

    // top part - manual pixel pushing
    for (let cy = yo; cy < this.py + yo; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3
        );
      }
    }

    // bottom part - more manual pixel pushing
    for (let cy = yo + this.size().h - this.py; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        buffer.set(
          new BigUint64Array([
            BigInt(" ".codePointAt(0)!),
            BigInt(this.fg),
            BigInt(this.bg),
          ]),
          (terminalWidth * cy + cx) * 3
        );
      }
    }

    // middle part - even more manual pixel pushing
    for (
      let cy = yo + this.size().h - 2 * this.py;
      cy < yo + this.size().h - 2 * this.py + this.height;
      cy++
    ) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        if (cx < xo + this.px || cx > xo + this.px + this.width - 1) {
          buffer.set(
            new BigUint64Array([
              BigInt(" ".codePointAt(0)!),
              BigInt(this.active_fg),
              BigInt(this.active_bg),
            ]),
            (terminalWidth * cy + cx) * 3
          );
        }
      }
    }

    // actual text
    buffer.set(
      this.prebuilt.subarray(0),
      (terminalWidth * (yo + this.py) + xo + this.px) * 3
    );

    this.updateHitMap(xo, yo); // hit-testing mixed in here too!
  }

  updateHitMap(xo: number, yo: number) {
    for (let cy = yo; cy < yo + this.size().h; cy++) {
      for (let cx = xo; cx < xo + this.size().w; cx++) {
        hitMap.set(cy * terminalWidth + cx, this.id);
      }
    }
  }

  // ...
}
```

Layout and painting were hopelessly tangled - `render()` calculates positions _and_ writes to the buffer _and_ updates the hit-map for click detection. Every component duplicates border-drawing logic. The API is completely inflexible: want to change how buttons look when pressed? Good luck finding the right place. Want to add a new component type? Copy-paste 100 lines and pray you got the coordinate math right.

The real problem emerged when I needed state management and dynamic updates. User types in an `Input`, clicks a `Button`, and the UI needs to update. My class-based approach required manual `setText()` calls that triggered `prerender()` and `render()`. Every component held mutable state, and coordinating updates became a mess of method calls.

This was my first attempt at building a TUI library and it kinda worked. I could render containers and primitives, make them nested and show some colors. I started to understand the problem space - what a render loop actually needs, which parts should be separate, how hit-testing works, why you need separate layout and painting processes and especially, how I want to handle dynamic updates.

At this point, it was time to stop playing around and started from scratch again, but now with a better understanding of how things should work.
