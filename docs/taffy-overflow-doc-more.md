# DeepWiki Q&A with Code Context for Repository: DioxusLabs/taffy
## Q1
does Taffy have any methods to help implement scrolling? if i'm building a UI library and want to want to add scrolling support for a component, what features, helpers and utilities does Taffy provide that I don't have to implement from scratch?
### Answer
The user is asking about scrolling support in Taffy. Let me search for scrolling-related features, utilities, and helpers in the Taffy codebase.



Let me now look at the Layout struct to understand the scroll_width/scroll_height helpers, and the content_size feature more closely.



I now have a comprehensive understanding of Taffy's scrolling support. Let me compile my answer.


Taffy provides several features to help implement scrolling in a UI library. It handles the **layout side** of scrolling (space reservation, content sizing, minimum size behavior) but does **not** handle the actual scroll position, scroll events, or rendering — those are your responsibility.

## 1. `Overflow` enum — Scroll Container Designation

The `Overflow` enum on `Style` controls how a node behaves as a scroll container. It is set **per-axis** via `Point<Overflow>`:

```rust
overflow: Point {
    x: Overflow::Scroll,  // horizontal scrolling
    y: Overflow::Scroll,  // vertical scrolling
},
``` taffy:302-332 

The four variants are:

| Variant | Auto min size | Clips content


I now have a comprehensive understanding of Taffy's scrolling support. Let me compile my answer.


Taffy provides several features to help implement scrolling in a UI library. It handles the **layout side** of scrolling (space reservation, content sizing, minimum size behavior) but does **not** handle the actual scroll position, scroll events, or rendering — those are your responsibility.

## 1. `Overflow` enum — scroll container designation

The `Overflow` enum on `Style` controls how overflowing children affect layout. It's set **per-axis** via `Point<Overflow>`: taffy:302-332 

- `Overflow::Visible` (default) — content-based automatic minimum size; overflow contributes to parent scroll region
- `Overflow::Clip` — content-based automatic minimum size; overflow does NOT contribute to parent scroll region
- `Overflow::Hidden` — automatic minimum size becomes `0`; overflow does NOT contribute to parent scroll region
- `Overflow::Scroll` — automatic minimum size becomes `0`, **plus** space is reserved for a scrollbar

```rust
Style {
    overflow: Point {
        x: Overflow::Scroll,
        y: Overflow::Scroll,
    },
    scrollbar_width: 15.0,
    ..Default::default()
}
```

## 2. `scrollbar_width` — scrollbar gutter reservation

The `scrollbar_width` field on `Style` controls how many pixels are reserved for a scrollbar when `Overflow::Scroll` is set. The space is reserved on the **opposite axis** (a vertical scrollbar takes horizontal space, and vice versa). If `scrollbar_width` is `0`, then `Scroll` behaves identically to `Hidden`. taffy:390-392 

All three layout algorithms (flexbox, grid, block) compute a `scrollbar_gutter` by transposing the overflow axes: taffy:441-451 taffy:138-151 

## 3. `scrollbar_size` in `Layout` output

After layout, each node's `Layout` includes a `scrollbar_size: Size<f32>` field that tells you the resolved scrollbar dimensions. This is computed as: taffy:240-241 taffy:1931-1934 

## 4. `content_size` — how much content overflows (feature-gated)

With the **`content_size`** Cargo feature enabled, the `Layout` struct includes a `content_size: Size<f32>` field. This tracks the total size of the content inside a node, which **may be larger than the node's `size`** when children overflow. This is the key data you need to determine scroll range. taffy:236-239 

## 5. `scroll_width()` / `scroll_height()` — computed scroll extent

Also behind the `content_size` feature flag, `Layout` provides two convenience methods that compute the scrollable overflow amount (how far the content extends beyond the visible area): taffy:325-346 

These return `0.0` when content fits, or a positive value representing the extra scrollable distance.

## 6. Automatic minimum size behavior

When `overflow` is `Hidden` or `Scroll`, the automatic minimum size of flexbox/grid items becomes `0` instead of being content-based. This is critical for scroll containers — without it, a flex/grid item would grow to fit all its content and never actually overflow. taffy:345-353 

## What you still need to implement yourself

- **Scroll position tracking** (current scroll offset per container)
- **Scroll event handling** (mouse wheel, touch, keyboard)
- **Clipping/rendering** (only drawing visible content within the scroll container bounds)
- **Scrollbar rendering** (Taffy reserves space but doesn't draw anything)
- **`Overflow::Auto`** is not implemented — you'd need to do two-pass layout yourself if you want scrollbars to appear only when content overflows

## Summary table

| Taffy provides | You implement |
|---|---|
| `Overflow` style property (per-axis) | Scroll position state |
| `scrollbar_width` space reservation | Scroll event handling |
| `scrollbar_size` in layout output | Scrollbar rendering |
| `content_size` (with feature flag) | Content clipping |
| `scroll_width()` / `scroll_height()` helpers | `Overflow::Auto` behavior |
| Automatic min-size = 0 for scroll containers | Hit testing within scroll regions |
### Citations
**File:** src/style/mod.rs (L302-332)
```rust
/// How children overflowing their container should affect layout
///
/// In CSS the primary effect of this property is to control whether contents of a parent container that overflow that container should
/// be displayed anyway, be clipped, or trigger the container to become a scroll container. However it also has secondary effects on layout,
/// the main ones being:
///
///   - The automatic minimum size Flexbox/CSS Grid items with non-`Visible` overflow is `0` rather than being content based
///   - `Overflow::Scroll` nodes have space in the layout reserved for a scrollbar (width controlled by the `scrollbar_width` property)
///
/// In Taffy, we only implement the layout related secondary effects as we are not concerned with drawing/painting. The amount of space reserved for
/// a scrollbar is controlled by the `scrollbar_width` property. If this is `0` then `Scroll` behaves identically to `Hidden`.
///
/// <https://developer.mozilla.org/en-US/docs/Web/CSS/overflow>
#[derive(Copy, Clone, PartialEq, Eq, Debug, Default)]
#[cfg_attr(feature = "serde", derive(Serialize, Deserialize))]
pub enum Overflow {
    /// The automatic minimum size of this node as a flexbox/grid item should be based on the size of its content.
    /// Content that overflows this node *should* contribute to the scroll region of its parent.
    #[default]
    Visible,
    /// The automatic minimum size of this node as a flexbox/grid item should be based on the size of its content.
    /// Content that overflows this node should *not* contribute to the scroll region of its parent.
    Clip,
    /// The automatic minimum size of this node as a flexbox/grid item should be `0`.
    /// Content that overflows this node should *not* contribute to the scroll region of its parent.
    Hidden,
    /// The automatic minimum size of this node as a flexbox/grid item should be `0`. Additionally, space should be reserved
    /// for a scrollbar. The amount of space reserved is controlled by the `scrollbar_width` property.
    /// Content that overflows this node should *not* contribute to the scroll region of its parent.
    Scroll,
}
```
**File:** src/style/mod.rs (L345-353)
```rust
    /// Returns `Some(0.0)` if the overflow mode would cause the automatic minimum size of a Flexbox or CSS Grid item
    /// to be `0`. Else returns None.
    #[inline(always)]
    pub(crate) fn maybe_into_automatic_min_size(self) -> Option<f32> {
        match self.is_scroll_container() {
            true => Some(0.0),
            false => None,
        }
    }
```
**File:** src/style/mod.rs (L390-392)
```rust
    pub overflow: Point<Overflow>,
    /// How much space (in points) should be reserved for the scrollbars of `Overflow::Scroll` and `Overflow::Auto` nodes.
    pub scrollbar_width: f32,
```
**File:** src/compute/flexbox.rs (L441-451)
```rust
    // Scrollbar gutters are reserved when the `overflow` property is set to `Overflow::Scroll`.
    // However, the axis are switched (transposed) because a node that scrolls vertically needs
    // *horizontal* space to be reserved for a scrollbar
    let scrollbar_gutter = style.overflow().transpose().map(|overflow| match overflow {
        Overflow::Scroll => style.scrollbar_width(),
        _ => 0.0,
    });
    // TODO: make side configurable based on the `direction` property
    let mut content_box_inset = padding + border;
    content_box_inset.right += scrollbar_gutter.x;
    content_box_inset.bottom += scrollbar_gutter.y;
```
**File:** src/compute/flexbox.rs (L1931-1934)
```rust
    let scrollbar_size = Size {
        width: if item.overflow.y == Overflow::Scroll { item.scrollbar_width } else { 0.0 },
        height: if item.overflow.x == Overflow::Scroll { item.scrollbar_width } else { 0.0 },
    };
```
**File:** src/compute/block.rs (L138-151)
```rust
    // Scrollbar gutters are reserved when the `overflow` property is set to `Overflow::Scroll`.
    // However, the axis are switched (transposed) because a node that scrolls vertically needs
    // *horizontal* space to be reserved for a scrollbar
    let scrollbar_gutter = {
        let offsets = style.overflow().transpose().map(|overflow| match overflow {
            Overflow::Scroll => style.scrollbar_width(),
            _ => 0.0,
        });
        // TODO: make side configurable based on the `direction` property
        Rect { top: 0.0, left: 0.0, right: offsets.x, bottom: offsets.y }
    };
    let padding_border = padding + border;
    let padding_border_size = padding_border.sum_axes();
    let content_box_inset = padding_border + scrollbar_gutter;
```
**File:** src/tree/layout.rs (L236-239)
```rust
    #[cfg(feature = "content_size")]
    /// The width and height of the content inside the node. This may be larger than the size of the node in the case of
    /// overflowing content and is useful for computing a "scroll width/height" for scrollable nodes
    pub content_size: Size<f32>,
```
**File:** src/tree/layout.rs (L240-241)
```rust
    /// The size of the scrollbars in each dimension. If there is no scrollbar then the size will be zero.
    pub scrollbar_size: Size<f32>,
```
**File:** src/tree/layout.rs (L325-346)
```rust
#[cfg(feature = "content_size")]
impl Layout {
    /// Return the scroll width of the node.
    /// The scroll width is the difference between the width and the content width, floored at zero
    pub fn scroll_width(&self) -> f32 {
        f32_max(
            0.0,
            self.content_size.width + f32_min(self.scrollbar_size.width, self.size.width) - self.size.width
                + self.border.right,
        )
    }

    /// Return the scroll height of the node.
    /// The scroll height is the difference between the height and the content height, floored at zero
    pub fn scroll_height(&self) -> f32 {
        f32_max(
            0.0,
            self.content_size.height + f32_min(self.scrollbar_size.height, self.size.height) - self.size.height
                + self.border.bottom,
        )
    }
}
```
