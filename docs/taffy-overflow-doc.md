# DeepWiki Q&A with Code Context for Repository: DioxusLabs/taffy
## Q1
when using "overflow" style prop for a Node. what are the valid values it accepts and how they work?
### Answer
The `overflow` style prop in Taffy accepts four valid values that control how content overflow affects layout: `Visible`, `Clip`, `Hidden`, and `Scroll` taffy:315-332 .

## Valid Values and Behavior

| Value | Description | Layout Effects |
|-------|-------------|----------------|
| `Visible` | Content can overflow and contributes to parent scroll region | Automatic minimum size based on content taffy:318-321  |
| `Clip` | Content is clipped but doesn't affect parent scroll region | Automatic minimum size based on content taffy:322-324  |
| `Hidden` | Content is hidden and doesn't affect parent scroll region | Automatic minimum size is `0` taffy:325-327  |
| `Scroll` | Content is hidden with scrollbar space reserved | Automatic minimum size is `0` + scrollbar space reservation taffy:328-331  |

## Usage

The overflow property is set per-axis using a `Point<Overflow>`:

```rust
overflow: Point { 
    x: Overflow::Visible, 
    y: Overflow::Scroll 
}
```

When using `Overflow::Scroll`, you can control the scrollbar width with the `scrollbar_width` property taffy:389-392 .

## Layout Impact

The overflow values primarily affect:

1. **Automatic minimum size** - `Hidden` and `Scroll` force a minimum size of `0` for flexbox/grid items taffy:345-353 
2. **Scrollbar space reservation** - `Scroll` reserves space for scrollbars in the opposite axis taffy:138-148 
3. **Margin collapsing** - Overflow values affect whether margins can collapse in block layout taffy:173-197 

## Notes

- `Overflow::Auto` is mentioned in the test generator but not currently implemented taffy:447-447 
- The overflow property was added in Taffy version 0.4.0 taffy:250-268 
- Each axis can have different overflow values independently

Wiki pages you might want to explore:
- [Architecture (DioxusLabs/taffy)](/wiki/DioxusLabs/taffy#3)
- [Grid Layout (DioxusLabs/taffy)](/wiki/DioxusLabs/taffy#5.2)
### Citations
**File:** src/style/mod.rs (L315-332)
```rust
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
**File:** src/style/mod.rs (L389-392)
```rust
    /// How children overflowing their container should affect layout
    pub overflow: Point<Overflow>,
    /// How much space (in points) should be reserved for the scrollbars of `Overflow::Scroll` and `Overflow::Auto` nodes.
    pub scrollbar_width: f32,
```
**File:** src/compute/block.rs (L138-148)
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
```
**File:** src/compute/block.rs (L173-197)
```rust
    let own_margins_collapse_with_children = Line {
        start: vertical_margins_are_collapsible.start
            && !style.overflow().x.is_scroll_container()
            && !style.overflow().y.is_scroll_container()
            && style.position() == Position::Relative
            && padding.top == 0.0
            && border.top == 0.0,
        end: vertical_margins_are_collapsible.end
            && !style.overflow().x.is_scroll_container()
            && !style.overflow().y.is_scroll_container()
            && style.position() == Position::Relative
            && padding.bottom == 0.0
            && border.bottom == 0.0
            && size.height.is_none(),
    };
    let has_styles_preventing_being_collapsed_through = !style.is_block()
        || style.overflow().x.is_scroll_container()
        || style.overflow().y.is_scroll_container()
        || style.position() == Position::Absolute
        || padding.top > 0.0
        || padding.bottom > 0.0
        || border.top > 0.0
        || border.bottom > 0.0
        || matches!(size.height, Some(h) if h > 0.0)
        || matches!(min_size.height, Some(h) if h > 0.0);
```
**File:** scripts/gentest/src/main.rs (L447-447)
```rust
                "auto" => Some(quote!(taffy::style::Overflow::Auto)),
```
**File:** CHANGELOG.md (L250-268)
```markdown
- Support for the `overflow` property (+ `scrollbar_width` for `overflow: scroll`)
- Improved measure function API
- Completely refactored low-level API
- Simplified module hierarchy (+ most types/functions are now exported from the crate root)
- Expanded set of examples which better document integration with other layout systems (e.g. text layout)
- Computed values for `padding` and `border` are now output into the `Layout` struct

### Block layout

Support for [CSS Block layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_Flow_Layout/Block_and_Inline_Layout_in_Normal_Flow#elements_participating_in_a_block_formatting_context) has been added. This can be used via the new `Display::Block` variant of the `Display` enum. Note that  full flow layout: inline, inline-block and float layout have *not* been implemented. The use case supported is block container nodes which contain block-level children.

### Overflow property

Support has been added for a new `overflow` style property with `Visible`, `Clip`, `Hidden`, and `Scroll` values (`Auto` is not currently implemented). Additionally a `scrollbar_width` property has been added to control the size of scrollbars for nodes with `Overflow::Scroll` set.

- Overflow is settable indpendently in each axis.
- `Visible` and `Clip` will produce layouts equivalent to the Taffy 0.3. `Clip` will affect the new `content_size` output by restricting it to the available space.
- `Hidden` and `Scroll` affect layout by changing the automatic minimum size of Flexbox and Grid children
- `Scroll` additionally reserves `scrollbar_width` pixels for a scrollbar in the opposite axis to which scrolling is enabled. `Scroll` with `scrollbar_width` set to zero is equivalent to `Hidden`.
```
