# Understanding Flexbox Layout: Main Axis vs Cross Axis

## The Problem We Encountered

When building our TUI (Terminal User Interface) library, we wanted containers (Column and Row) to fill the available space in the terminal. Initially, our Column and Row components were only as big as their content - they didn't expand to fill their parent containers.

**What we wanted:**
- Column should fill the entire terminal height
- Row inside Column should fill the entire width
- Text inside Row should only take the space it needs

## First Attempt: Using `flex_grow` ❌

Our first idea was to use `flex_grow: 1.0` on Column and Row to make them expand.

```rust
match node.node_type.as_str() {
    "column" => {
        style.flex_direction = FlexDirection::Column;
        style.flex_grow = 1.0;  // ❌ This caused problems!
    }
    "row" => {
        style.flex_direction = FlexDirection::Row;
        style.flex_grow = 1.0;  // ❌ This caused problems!
    }
    _ => {}
}
```

### Why This Didn't Work

To understand why, we need to know about **main axis** and **cross axis** in flexbox:

### Understanding Axes in Flexbox

Think of flexbox like a street grid:

**Main Axis** = The "main street" where items flow
**Cross Axis** = The "side streets" perpendicular to the main street

The direction depends on `flex-direction`:

| flex-direction | Main Axis Direction | Cross Axis Direction |
|----------------|---------------------|---------------------|
| `row` | → Horizontal (left to right) | ↓ Vertical (top to bottom) |
| `column` | ↓ Vertical (top to bottom) | → Horizontal (left to right) |

### What `flex_grow` Actually Does

**`flex_grow` makes items grow along the MAIN axis**, not the cross axis.

So here's what happened:

1. **Column** (flex-direction: column)
   - Main axis: Vertical ↓
   - Children (like Row) grew **vertically** with `flex_grow: 1.0` ❌
   - Row took up the entire height instead of just what it needed!

2. **Row** (flex-direction: row)
   - Main axis: Horizontal →
   - Children (like Text) grew **horizontally** with `flex_grow: 1.0` ✓
   - This was actually correct for horizontal growth

3. **The Result:**
   - Row was stretching vertically (wrong!)
   - Text was stretching vertically (wrong!)
   - Everything was taking too much vertical space

## The Solution: Using `align_items: Stretch` ✅

The correct approach is to use `align_items: Stretch` instead:

```rust
match node.node_type.as_str() {
    "column" => {
        style.flex_direction = FlexDirection::Column;
        style.align_items = Some(AlignItems::Stretch);  // ✅ Correct!
    }
    "row" => {
        style.flex_direction = FlexDirection::Row;
        style.align_items = Some(AlignItems::Stretch);  // ✅ Correct!
    }
    _ => {}
}
```

### Why This Works

**`align_items: Stretch` makes children fill the CROSS axis**, not the main axis.

Here's what happens now:

1. **Column** (flex-direction: column)
   - Main axis: Vertical ↓
   - Cross axis: Horizontal →
   - Children (like Row) stretch **horizontally** to fill width ✅
   - Row fills the width but only takes the height it needs!

2. **Row** (flex-direction: row)
   - Main axis: Horizontal →
   - Cross axis: Vertical ↓
   - Children (like Text) stretch **vertically** to fill row's height ✅
   - Text fills the row's height but only takes the width it needs!

3. **The Result:**
   - Column fills the terminal dimensions (set explicitly)
   - Row stretches to Column's full width ✅
   - Text stretches to Row's height ✅
   - Nothing grows in unwanted directions!

## Visual Comparison

### With `flex_grow` ❌

```
┌─ Column (full terminal) ────────┐
│ ┌─ Row (grows vertically!) ────┐│
│ │ ┌─ Text (grows vertically!) ─││
│ │ │                            │││
│ │ │  Search                   │││
│ │ │                            │││
│ │ │        (too tall!)         │││
│ │ └────────────────────────────┘││
│ └──────────────────────────────┘│
└──────────────────────────────────┘
```

### With `align_items: Stretch` ✅

```
┌─ Column (full terminal) ────────┐
│ ┌─ Row (stretches width) ──────┐│
│ │ ┌─ Text ─┐                   ││
│ │ │ Search │  (just right!)    ││
│ │ └────────┘                   ││
│ └──────────────────────────────┘│
│                                  │
│  (Column still has space below) │
└──────────────────────────────────┘
```

## Key Takeaways

1. **`flex_grow`** controls growth along the **main axis**
   - Use it when you want items to expand in the flow direction
   - Column → items grow vertically
   - Row → items grow horizontally

2. **`align_items: Stretch`** controls stretching along the **cross axis**
   - Use it when you want items to fill perpendicular to the flow
   - Column → children fill width
   - Row → children fill height

3. **Know your axes!**
   - `flex-direction: column` → main: ↓ vertical, cross: → horizontal
   - `flex-direction: row` → main: → horizontal, cross: ↓ vertical

4. **For the root container**, set explicit size:
   ```rust
   root_styles.size = Size {
       width: length(tree.width),
       height: length(tree.height),
   };
   ```
   This gives Flexbox a defined space to work with.

## References

- [MDN: Basic Concepts of Flexbox](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Flexible_box_layout/Basic_concepts)
- [CSS-Tricks: A Complete Guide to Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)
- [Josh W. Comeau: An Interactive Guide to Flexbox](https://www.joshwcomeau.com/css/interactive-guide-to-flexbox/)

---

**Remember:** When in doubt, think about which direction you want things to grow:
- Same direction as flow? Use `flex_grow`
- Perpendicular to flow? Use `align_items: Stretch`
