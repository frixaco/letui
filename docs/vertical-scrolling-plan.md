# vertical scrolling plan

## goal

Add component-level vertical scrolling with the smallest API and implementation that still feels like a real library feature.

For the first version, only `Column` should be scrollable.

The desired user experience is:

- user marks a `Column` as scrollable with `overflow: true` or `overflow: "scroll"`
- user drives the scroll position with `scrollTop`
- layout still comes from Taffy
- scrolling does not require remounting children or guessing row heights
- performance stays close to the current fast path by keeping the tree shape stable

## recommendation

Implement scrolling mostly in Rust, not in TypeScript.

That means:

- expose `overflow` and `scrollTop` on `Column`
- send those values through the existing style-op pipeline
- let Taffy own the layout semantics of `overflow`, but keep `scrollTop` out of layout
- apply the vertical offset during painting
- clip child painting to the scrollable column's content box
- keep general virtualization out of v1

This is the same core direction as the earlier proposal, just with `overflow` as the public switch instead of a dedicated `overflowY` prop.

## what the Taffy docs change

The Taffy docs are important here because `overflow` is not just a cosmetic flag.

Taffy supports four overflow values:

- `Visible`
- `Clip`
- `Hidden`
- `Scroll`

And it stores them per-axis as `Point<Overflow>`.

Two consequences matter for this plan:

1. `Hidden` and `Scroll` change automatic minimum size for flexbox and grid items by forcing it to `0`.
2. `Scroll` can reserve scrollbar gutter space through `scrollbar_width`.

That means the implementation should not treat `overflow` as a plain boolean internally. It should map the public prop onto Taffy's real overflow model on the Rust side.

For letui v1, the intended meaning is:

- public API stays minimal: `overflow: true` or `overflow: "scroll"` means "make this `Column` vertically scrollable"
- TypeScript normalizes `true` to `"scroll"` before sending style ops
- Rust stores the real Taffy-style overflow state per axis

For a vertically scrollable `Column`, the internal Taffy mapping should be:

```rs
overflow: Point {
    x: Overflow::Clip,
    y: Overflow::Scroll,
}
scrollbar_width: 0.0
```

Why this mapping:

- `y: Scroll` gives us scroll-container layout semantics in the vertical axis
- `x: Clip` keeps horizontal painting clipped without turning the x axis into a scroll container
- `scrollbar_width: 0.0` avoids reserving gutter space for a scrollbar that letui v1 does not render

## what Taffy overflow does in letui today

This is the current state before any scrolling work lands.

Letui does not currently expose a public `overflow` prop in TypeScript, so app code cannot opt into Taffy overflow intentionally yet.

But the Rust side already sets Taffy overflow for every `Column` internally. In `core/src/tree.rs`, `Column` nodes are currently mapped to:

```rs
style.overflow = Point {
    x: Overflow::Hidden,
    y: Overflow::Hidden,
};
```

That means Taffy already treats every `Column` as a non-visible-overflow container for layout purposes.

Practical consequences today:

- `Column` already gets the layout-side behavior of a scroll container in Taffy, especially around automatic minimum size
- this may already help some flex layouts shrink instead of expanding to fit all content
- this does not create real scrolling behavior in letui
- this does not create general descendant clipping in the renderer
- this does not create scroll position state, scroll events, or scrollbar rendering

So when we say "add scrolling," we are not starting from zero. We are starting from a library that already uses Taffy overflow as a layout hint, but does not yet connect it to painting or input behavior.

This also means the implementation should replace that hardcoded `Hidden/Hidden` behavior with something deliberate and public, rather than layering a second scrolling system on top of it.

## what Taffy gives us vs what letui still owns

Taffy helps with the layout side of scrolling, but not with the runtime side.

Taffy gives us:

- per-axis overflow modes
- correct min-size behavior for scroll containers
- optional scrollbar gutter reservation
- optional `scrollbar_size` layout output
- optional `content_size`, `scroll_width()`, and `scroll_height()` helpers when the `content_size` feature is enabled

Letui still has to implement:

- `scrollTop` state
- keyboard and mouse scroll behavior
- clipping child painting to the viewport
- applying the visual scroll offset during painting
- hit-testing only the visible scrolled region
- scrollbar drawing if we ever want one

This split is the core design constraint. Taffy can tell us what the scroll container means for layout. Letui must still make the scroll container behave like a scroll container at runtime.

## why this is the right shape

### 1. `Column` should be the first and only scrollable component

This keeps the surface area small and gives us one clear layout model to make correct.

`Column` is the natural first target because vertical lists, stacked panels, log views, and result panes already map onto it. If this works well, we can later decide whether `Row`, `Box`, or `Input` need scrolling too.

### 2. `overflow` should stay simple publicly, but map to real Taffy overflow internally

`overflow` is a good opt-in flag, but it is not enough by itself.

We still need a separate `scrollTop` value because the renderer has to know which slice of the content should be visible.

So the first API should be:

```ts
const offset = $(0);

const list = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    overflow: true,
    scrollTop: 0,
  },
  items,
);

ff(() => {
  list.setStyle({ scrollTop: offset() });
});

onKey("j", () => offset(offset() + 1));
onKey("k", () => offset(Math.max(0, offset() - 1)));
```

I recommend treating these as equivalent in v1:

- `overflow: true`
- `overflow: "scroll"`

And these as not scrollable:

- `overflow: undefined`
- `overflow: false`

Important nuance from Taffy:

- `overflow: "scroll"` has real layout meaning, not just paint meaning
- it is axis-specific in Taffy, even if letui's public API is simpler for now
- it can reserve scrollbar gutter space unless `scrollbar_width` is set to `0`

That is why the plan keeps the user-facing prop small while still storing a richer internal representation.

I do not recommend exposing all four Taffy values in letui's public API yet. `Visible`, `Clip`, and `Hidden` are real layout promises, and v1 only needs one concrete feature: a vertically scrollable `Column`.

### 3. scrolling should not be implemented by swapping visible children in TS

The runtime is optimized for stable tree shape.

Today the TypeScript side builds a sent-tree snapshot every frame and compares it with the previous one. If the shape changes, Rust tree state is cleared and rebuilt. That makes repeated mount/unmount cycles the wrong default for general scrolling.

That is why the measured two-pass windowing in `examples/anitrack.ts` is a good specialized technique, but not the right foundation for generic scrolling.

Use that pattern later for a dedicated large-list component if we need it. Do not use it as the library-wide scroll primitive.

### 4. scrolling belongs in Rust because layout, paint, and clipping truth already live there

Rust already owns:

- Taffy layout
- painting into the terminal buffer
- text clipping to node bounds
- frame measurement synced back to JS

If scrolling lives in TypeScript, we would end up re-implementing viewport math on the JS side while the real drawing still happens in Rust.

If scrolling lives in Rust, the system stays coherent:

- JS declares scroll state
- Rust decides what is visible
- JS still reads measured layout back from the renderer

### 5. do not implement true virtualization in v1

Two reasons:

- the external libraries we studied mostly do not do general virtualization either
- true virtualization is a bad first fit for letui because it pushes against stable tree identity

The biggest practical win for v1 is plain vertical scrolling with clipping.

If later we need very large flat lists, we should build a dedicated `VirtualList`-style abstraction rather than trying to virtualize arbitrary nested child trees.

## proposed public API

### TypeScript props

Add these fields to `ColumnProps` only in v1:

```ts
export type Overflow = boolean | "scroll";

export type ColumnProps = BoxProps & {
  gap?: number;
  overflow?: Overflow;
  scrollTop?: number;
};
```

Notes:

- `overflow` is intentionally tiny for v1 even though Taffy supports more values
- `true` should be normalized to `"scroll"` before FFI encoding so the style-op format stays string-or-number based
- `overflow` and `scrollTop` are `Column`-only props in v1
- no horizontal scrolling yet
- no scrollbar widget yet
- no `onScroll` callback yet
- no `scrollIntoView` helper yet

### intended usage pattern

The recommended structure should be one scrollable outer column with one inner content column:

```ts
const content = Column({ gap: 1 }, rows);

const viewport = Column(
  {
    flexGrow: 1,
    minHeight: 0,
    overflow: true,
    scrollTop: 0,
  },
  [content],
);
```

This keeps the mental model simple:

- outer column = viewport
- inner column = full content

It also gives us a clean way to measure content height later if we want to clamp in JS or expose helpers.

One subtle benefit from Taffy: `Overflow::Scroll` is treated as a scroll container for layout, which may reduce the need for manual `minHeight: 0` in some flex layouts. I would still keep `minHeight: 0` in example code until that behavior is verified end-to-end in letui.

## decision on Taffy `content_size`

Today letui depends on Taffy without the `content_size` feature enabled.

That means we do not currently get:

- `Layout::content_size`
- `Layout::scroll_width()`
- `Layout::scroll_height()`

These helpers are the chosen path for v1 because they simplify clamp logic and keep the implementation aligned with Taffy's own layout output.

### decision

Enable Taffy's `content_size` feature as part of the scrolling work.

Why:

- it gives Rust the real post-layout content extent instead of forcing us to approximate it from child bounds
- it makes `scrollTop` clamping simpler and less error-prone
- it fits the direction of the feature, because scrolling is exactly the use case `content_size` was added to support

With `content_size` enabled, the clamp shape becomes:

```rs
let layout = taffy.layout(node_id).unwrap();
let max_scroll_top = layout.scroll_height();
let scroll_top = ctx.style.scroll_top.clamp(0.0, max_scroll_top);
```

If enabling the feature reveals a measurable regression, that should be treated as a concrete follow-up investigation rather than a reason to keep the v1 design ambiguous.

## implementation plan

### phase 1: thread props through the TS API

Files:

- `src/types.ts`
- `src/components.ts`
- `src/ops.ts`
- `src/runtime.ts`

Work:

1. Add `overflow` and `scrollTop` to `ColumnProps` and the corresponding internal style / box signal types as needed.
2. Create signals for those props in `createStyleSignals()` or `createBoxSignals()`.
3. Normalize `overflow: true` to `overflow: "scroll"` before style diffing so the wire format does not need a boolean branch.
4. Include them in the emitted style props list so the runtime can diff and send updates.
5. Read them in the sent-style snapshot builder so a changed `scrollTop` becomes a normal style delta, not a tree rebuild.

Important design choice:

`scrollTop` should travel through the same style-op path as other layout and paint-affecting props. That keeps the system simple and avoids inventing a second mutation channel.

### phase 2: store scroll state in Rust node style

Files:

- `core/src/tree.rs`

Work:

1. Extend node style state with `overflow` and `scroll_top`.
2. Parse the new style names from the binary op stream.
3. Apply them to node style.
4. Replace the current hardcoded `Column => Hidden/Hidden` behavior with a public, data-driven overflow mapping.
5. Map letui's public `overflow` flag onto real Taffy axis values.
6. Set `scrollbar_width` to `0.0` for v1 so `Overflow::Scroll` does not reserve layout gutter space for a scrollbar we are not rendering.
7. Enable Taffy's `content_size` feature and wire it in now so post-layout scroll range helpers are available in the same phase.
8. Do not rely on Taffy alone to perform visible clipping; keep renderer clip logic explicit.

Important design choice:

Taffy's overflow support is part of the feature, not just metadata. It should drive the right layout semantics. But it is still not the whole feature, because the renderer must do explicit clip handling and paint-time offset.

Conceptually:

```rs
fn resolved_column_overflow(value: ColumnOverflow) -> Point<Overflow> {
    match value {
        ColumnOverflow::NotScrollable => Point {
            x: Overflow::Hidden,
            y: Overflow::Hidden,
        },
        ColumnOverflow::Scrollable => Point {
            x: Overflow::Clip,
            y: Overflow::Scroll,
        },
    }
}
```

This keeps the x and y axis behavior intentional instead of accidentally using the same overflow mode everywhere.

### phase 3: add paint-time clipping and vertical offset in Rust

Files:

- `core/src/render.rs`
- `core/src/surface.rs`

This is the core of the feature.

The renderer should keep layout untouched, then do two extra things while painting:

1. if a `Column` is scrollable, restrict child painting to the column's content box
2. shift child painting upward by `scrollTop`

More precisely: `scrollTop` should not affect Taffy's layout pass, but `overflow` still can affect layout through Taffy's own scroll-container semantics.

The recursive paint function will need one more piece of state: the active clip rect.

Conceptually:

```rs
fn paint_taffy_node(..., parent_rect: SurfaceRect, clip_rect: SurfaceRect) {
    let rect = ...;
    let content_rect = ...;

    let local_clip = intersect(clip_rect, rect);
    if local_clip.is_empty() {
        return;
    }

    paint_self(..., local_clip);

    let child_clip = if ctx.style.overflow_is_scrollable() {
        intersect(local_clip, content_rect)
    } else {
        local_clip
    };

    let child_parent_rect = if ctx.style.overflow_is_scrollable() {
        SurfaceRect {
            x: rect.x,
            y: rect.y - clamped_scroll_top,
            w: rect.w,
            h: rect.h,
        }
    } else {
        rect
    };

    for child in children {
        paint_taffy_node(..., child_parent_rect, child_clip);
    }
}
```

Important design choices:

- scroll should happen at paint time, not by mutating layout
- clip should be inherited down the subtree
- subtree paint should be skipped early when it does not intersect the clip rect

This gives us a large chunk of the performance benefit without needing virtualization.

### phase 4: clamp `scrollTop` correctly

We should clamp in Rust even if JS also tries to be polite.

`scrollTop` should be treated as a row offset, not a sub-cell pixel offset.

That means:

- minimum is `0`
- maximum is `content_height - viewport_height`
- if content fits, effective max is `0`
- final effective value is floored to an integer cell offset before paint
- non-finite JS input should normalize to `0`

Pseudo-code:

```rs
let max_scroll_top = (content_height - viewport_height).max(0.0);
let scroll_top = ctx.style.scroll_top.clamp(0.0, max_scroll_top);
```

Preferred version if `content_size` is enabled:

```rs
let layout = taffy.layout(node_id).unwrap();
let max_scroll_top = layout.scroll_height();
let requested_scroll_top = sanitize_scroll_top(ctx.style.scroll_top);
let scroll_top = requested_scroll_top.clamp(0.0, max_scroll_top).floor();
```

Important design choice:

The renderer should be the final source of truth. That way bad JS state cannot break rendering.

The Taffy docs make this even more important: overflow can change layout size behavior, so the final clamp should be based on the post-layout viewport and content dimensions that Rust already knows.

### phase 5: fix hit-testing for scrolled content

Files:

- `src/runtime.ts`
- possibly new Rust exports next to frame exports

This is the only part that I do not recommend hand-waving away.

Today JS marks interactive areas from unmodified layout frames. That is fine while visual position equals layout position. It stops being correct once a child is shifted and clipped by scrolling.

Recommended fix:

1. Build a Rust-side hitmap buffer with one node id per terminal cell.
2. While painting visible interactive nodes, fill the clipped visible interactive frame rect into that buffer, not just text glyph cells.
3. Export the hitmap alongside the frame buffer.
4. In JS, replace `markInteractiveHitArea()` with a read from the hitmap.

Conceptually:

```ts
const hitmapPtr = api.get_hitmap_ptr();
const hitmapLen = Number(api.get_hitmap_len());
const hitmap = new Uint32Array(toArrayBuffer(hitmapPtr as Pointer, 0, hitmapLen * 4));

function getNodeAt(x: number, y: number): Node | undefined {
  const id = hitmap[y * terminalWidth() + x];
  return id !== 0 ? nodeRegistry.get(id) : undefined;
}
```

Important design choice:

Hit-testing should use what was actually visible on screen, not what the raw layout rectangles would have suggested.

For overlapping interactive regions, the hitmap should follow paint order so the topmost visible node wins.

### phase 6: example and docs

Files:

- `examples/anitrack.ts`
- `README.md`
- `docs/components-and-styling.md`
- `docs/state-events-lifecycle.md`

Work:

1. Update `anitrack` to use real column scrolling instead of manual visible-window child slicing, but keep the example focused on scrolling behavior rather than polished active-state following.
2. Document the new `overflow` and `scrollTop` props.
3. Explain that v1 is vertical-only and column-only.
4. Explain that this is scrolling, not virtualization.

## what we are explicitly not doing in v1

Leave all of this for later:

- horizontal scrolling
- public scrollbar component
- wheel support if it complicates the first merge
- `scrollIntoView`
- automatic selection following
- generic virtualization for arbitrary child trees
- rich editor scrolling for `Input`

Also out of scope for v1 even though Taffy supports pieces of it:

- exposing the full `Visible` / `Clip` / `Hidden` / `Scroll` API publicly
- public control of `scrollbar_width`
- scrollbar gutter reservation as a visible feature

This is deliberate. The best first version should solve one real problem cleanly.

## finalized API scope: `overflow` and `scrollTop` are `Column`-only

For v1, these props should live on `Column` only.

Why:

- the feature itself is intentionally column-only in v1
- it keeps the type surface honest instead of relying on silent no-op behavior
- it avoids documenting support that the runtime does not actually provide yet
- it leaves room to generalize later once runtime semantics for other containers are real

## testing and verification plan

### type-level checks

- `bun run typecheck`

### rust checks

- `bun run check:rust`

### manual TUI checks

Use a small purpose-built example and `examples/anitrack.ts`.

Scenarios to verify:

1. content shorter than viewport
2. content taller than viewport
3. scrollTop at `0`
4. scrollTop beyond max clamps correctly
5. borders and padding still paint correctly
6. partially visible top and bottom children clip cleanly
7. focused button inside scrolled content still receives Enter
8. mouse click inside visible scrolled content hits the correct node
9. mouse click on clipped-out area does not hit hidden content
10. resizing terminal keeps scroll rendering sane

### useful regression test targets

If we add tests, the highest-value ones are Rust-side.

Good candidates:

- clip rect intersection helper
- scroll clamp logic
- paint skipping for non-intersecting subtree

I would avoid over-testing the TS prop plumbing unless a bug appears there.

## rollout strategy

### small first merge

If we want the safest incremental delivery:

1. add API plumbing for `overflow` and `scrollTop`
2. add Rust paint-time scrolling and clipping
3. ship keyboard-driven demo usage first
4. add Rust-backed hitmap immediately after, or in the same branch if mouse support must stay correct

### preferred merge

If we want one coherent feature merge:

1. enable Taffy `content_size`
2. TS prop plumbing
3. Rust scroll + clip
4. Rust hitmap
5. docs + example update

I prefer the coherent merge because partial mouse correctness will be confusing.

## follow-up feature after v1

If vertical scrolling works well and we later need huge lists, the next feature should be a dedicated virtual list abstraction.

That future component can reuse the measured-window idea proven in `examples/anitrack.ts`:

- mount stable row nodes
- measure real heights from the renderer
- compute the visible window from measured heights
- only update visible children when the component itself chooses to do so

That should be a separate feature, not hidden inside the first generic scrolling implementation.

## final recommendation

Build v1 as real column scrolling, not virtualization.

The shortest path that still looks correct is:

- `Column({ overflow: true | "scroll", scrollTop })`
- `overflow` and `scrollTop` exposed on `Column` only
- non-scrollable `Column` keeps today's `Hidden/Hidden` layout behavior
- scrollable `Column` maps intentionally to `x: Clip`, `y: Scroll`, `scrollbar_width: 0.0`
- Taffy `content_size` enabled so Rust can clamp from `layout.scroll_height()`
- Rust-owned paint-time vertical offset
- Rust-owned clip propagation
- Rust-backed hit-testing for clipped visible interactive frame cells

This gives the library a proper scrolling primitive without over-engineering the API or fighting the current runtime architecture.
