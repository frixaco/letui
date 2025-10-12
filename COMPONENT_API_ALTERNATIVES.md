# Component API Alternatives

**Goals**: Easy to compose • Minimal API • Flexible

---

## 📋 Current Approach Analysis

### Problems with Current OOP API

```typescript
// Current (verbose and imperative):
const v = new View();
const c = new Column("square", "end");
const b1 = new Button("button", cl.bg, cl.green, "none", cl.cyan, cl.yellow);
c.add(b1);

const r1 = new Row("rounded", "end");
r1.add(new Text("Hello", cl.cyan, cl.yellow));
r1.add(new Text(" World", cl.cyan, cl.yellow));
c.add(r1);

v.add(c);
v.render();
```

**Issues**:
- ❌ Imperative composition (manual `add()` calls)
- ❌ Retained component instances clutter memory
- ❌ Complex event routing (global `componentMap`, `hitMap`)
- ❌ Manual render choreography
- ❌ Large API surface (classes, methods, state management)
- ❌ Tight coupling between components and rendering

---

## ✨ Approach A: Immediate-Mode Functional API

### Design Philosophy

**Inspired by Dear ImGui**: No retained UI objects. Each frame, you declare the UI hierarchy with simple functions. The library manages layout, hit-testing, and focus. State is external.

### Core API (5 functions)

```typescript
// Layout containers
ui.col(opts, fn)    // Vertical layout
ui.row(opts, fn)    // Horizontal layout

// Widgets
ui.text(content, style?)
ui.button(label, style?) -> boolean
ui.input(id, value, opts?) -> { value, changed, submitted, focused }
```

### Complete Example

```typescript
import { createUI } from "letui";

const ui = createUI({ renderer: bunFFIRenderer });

// App state (external)
let name = "";
let clicks = 0;

function tick() {
  ui.frame(() => {
    ui.col({ border: "square", gap: 1 }, () => {
      
      ui.text("Hello World", { fg: cl.cyan, bg: cl.yellow });
      
      ui.row({ gap: 2 }, () => {
        ui.text("Le", { fg: cl.red, bg: cl.blue });
        ui.text("Tui", { fg: cl.grey, bg: cl.magenta });
      });
      
      // Button returns true when clicked
      if (ui.button("Click Me", { 
        activeFg: cl.cyan, 
        activeBg: cl.yellow 
      })) {
        clicks++;
      }
      
      // Input returns updated value
      const inp = ui.input("name", name, { 
        border: "square", 
        fg: cl.magenta 
      });
      if (inp.changed) {
        name = inp.value;
      }
      
      ui.text(`Clicks: ${clicks}`, { fg: cl.white });
    });
  });
  // flush() is called automatically
}

// Integration with event loop
process.stdin.on("data", () => tick());
process.stdout.on("resize", () => tick());
```

### API Details

#### Options Types

```typescript
type LayoutOpts = {
  border?: "none" | "square" | "rounded";
  justify?: "start" | "end" | "center";
  align?: "start" | "end" | "center";
  gap?: number;
  pad?: { x: number; y: number };
};

type Style = {
  fg?: number;
  bg?: number;
  activeFg?: number;  // For interactive elements
  activeBg?: number;
};

type InputOpts = Style & {
  border?: "none" | "square" | "rounded";
  placeholder?: string;
  multiline?: boolean;
};
```

#### Widget Returns

```typescript
// Button
ui.button(label: string, style?: Style) -> boolean

// Input
ui.input(id: string, value: string, opts?: InputOpts) -> {
  value: string;      // Current value
  changed: boolean;   // Changed this frame
  submitted: boolean; // Enter pressed
  focused: boolean;   // Has focus
}

// Future widgets
ui.checkbox(id: string, checked: boolean) -> boolean
ui.select(id: string, value: string, options: string[]) -> string
ui.slider(id: string, value: number, min: number, max: number) -> number
```

### Implementation Architecture

```typescript
class UIContext {
  private layoutStack: Rect[] = [];
  private idStack: string[] = [];
  private hot: string | null = null;      // Mouse over
  private active: string | null = null;   // Mouse pressed
  private focus: string | null = null;    // Keyboard focus
  private hitMap: Map<number, string>;
  private renderer: Renderer;
  
  frame(fn: () => void) {
    this.beginFrame();
    fn();
    this.endFrame();
  }
  
  col(opts: LayoutOpts, fn: () => void) {
    const rect = this.allocateRect();
    this.pushLayout(rect, "vertical");
    fn();
    this.popLayout();
  }
  
  button(label: string, style?: Style): boolean {
    const id = this.getId(label);
    const rect = this.allocateRect();
    
    this.registerHit(rect, id);
    this.renderer.drawButton(rect, label, {
      ...style,
      pressed: this.active === id,
      hover: this.hot === id
    });
    
    return this.wasClicked(id);
  }
  
  input(id: string, value: string, opts?: InputOpts) {
    const fullId = this.getId(id);
    const rect = this.allocateRect();
    
    this.registerHit(rect, fullId);
    
    const focused = this.focus === fullId;
    const newValue = focused ? this.getInputValue(fullId, value) : value;
    
    this.renderer.drawInput(rect, newValue, {
      ...opts,
      focused
    });
    
    return {
      value: newValue,
      changed: newValue !== value,
      submitted: this.wasSubmitted(fullId),
      focused
    };
  }
}
```

### Pros & Cons

**✅ Pros**:
- **Minimal API**: 5 core functions vs 7+ classes
- **Zero retained state**: No component instances
- **Natural composition**: Function nesting
- **Simple event handling**: Return values, no callbacks
- **Performance**: No VDOM diffing, direct buffer writes
- **Intuitive**: Reads like the UI structure

**❌ Cons**:
- **ID discipline**: Users must provide stable IDs for stateful widgets
- **External state**: State lives outside (but this is explicit and testable)
- **Animation state**: Needs extra helpers for transitions
- **Less declarative**: More imperative than VDOM approach

**When to use**: Simple dashboards, tools, forms where state is straightforward and performance is critical.

---

## ✨ Approach B: Declarative Tree (VDOM-lite + TEA)

### Design Philosophy

**Inspired by Elm/TEA**: Pure `view(model)` returns a tree. A tiny reconciler diffs and patches. Events flow as messages through an `update(model, msg)` function.

### Core API (6 functions)

```typescript
// Node constructors
col(props, ...children)
row(props, ...children)
text(content, style?)
button(label, props?)
input(value, props?)

// App harness
app({ init, update, view })
```

### Complete Example

```typescript
import { col, row, text, button, input, app } from "letui";

// Model
type Model = {
  name: string;
  clicks: number;
};

// Messages
type Msg = 
  | { type: "Input"; value: string }
  | { type: "Click" }
  | { type: "Submit" };

// Init
const init: Model = {
  name: "",
  clicks: 0
};

// Update
const update = (model: Model, msg: Msg): Model => {
  switch (msg.type) {
    case "Input":
      return { ...model, name: msg.value };
    
    case "Click":
      return { ...model, clicks: model.clicks + 1 };
    
    case "Submit":
      console.log(`Submitted: ${model.name}`);
      return model;
  }
};

// View
const view = (model: Model) =>
  col({ border: "square", gap: 1, key: "root" },
    text("Hello World", { fg: cl.cyan, bg: cl.yellow }),
    
    row({ gap: 2, key: "r1" },
      text("Le", { fg: cl.red, bg: cl.blue }),
      text("Tui", { fg: cl.grey, bg: cl.magenta })
    ),
    
    button("Click Me", {
      key: "btn",
      activeFg: cl.cyan,
      activeBg: cl.yellow,
      onClick: () => ({ type: "Click" })
    }),
    
    input(model.name, {
      key: "name",
      border: "square",
      fg: cl.magenta,
      onChange: (value: string) => ({ type: "Input", value }),
      onSubmit: () => ({ type: "Submit" })
    }),
    
    text(`Clicks: ${model.clicks}`, { 
      key: "counter",
      fg: cl.white 
    })
  );

// Run
app({ init, update, view, renderer: bunFFIRenderer }).run();
```

### API Details

#### Node Structure

```typescript
type Node = {
  type: "col" | "row" | "text" | "button" | "input";
  props: Props;
  children: Node[];
  layout?: Rect;  // Computed during layout pass
};

type Props = {
  key: string;           // Required for siblings
  border?: Border;
  justify?: Justify;
  gap?: number;
  pad?: { x: number; y: number };
  fg?: number;
  bg?: number;
  activeFg?: number;
  activeBg?: number;
  onClick?: () => Msg;
  onChange?: (value: string) => Msg;
  onSubmit?: () => Msg;
};
```

#### Helper Constructors

```typescript
function col(props: Props, ...children: Node[]): Node {
  return { type: "col", props, children };
}

function row(props: Props, ...children: Node[]): Node {
  return { type: "row", props, children };
}

function text(content: string, style?: Style): Node {
  return { 
    type: "text", 
    props: { ...style, content }, 
    children: [] 
  };
}

function button(label: string, props: Props): Node {
  return { 
    type: "button", 
    props: { ...props, label }, 
    children: [] 
  };
}

function input(value: string, props: Props): Node {
  return { 
    type: "input", 
    props: { ...props, value }, 
    children: [] 
  };
}
```

#### App Harness

```typescript
function app<M, Msg>({ init, update, view, renderer }: {
  init: M;
  update: (model: M, msg: Msg) => M;
  view: (model: M) => Node;
  renderer: Renderer;
}) {
  let model = init;
  let prevTree: Node | null = null;
  
  const dispatch = (msg: Msg) => {
    model = update(model, msg);
    render();
  };
  
  const render = () => {
    const tree = view(model);
    const patches = diff(prevTree, tree);
    applyPatches(patches, renderer);
    prevTree = tree;
  };
  
  return {
    run: () => {
      setupEventLoop(dispatch);
      render();
    },
    dispatch
  };
}
```

### Implementation Architecture

#### Reconciler (Keyed Diff)

```typescript
type Patch = 
  | { type: "CREATE"; node: Node; at: Rect }
  | { type: "UPDATE"; node: Node; at: Rect }
  | { type: "DELETE"; at: Rect }
  | { type: "MOVE"; from: Rect; to: Rect };

function diff(oldNode: Node | null, newNode: Node): Patch[] {
  if (!oldNode) {
    return [{ type: "CREATE", node: newNode, at: computeRect(newNode) }];
  }
  
  if (oldNode.type !== newNode.type || oldNode.props.key !== newNode.props.key) {
    return [
      { type: "DELETE", at: oldNode.layout! },
      { type: "CREATE", node: newNode, at: computeRect(newNode) }
    ];
  }
  
  // Props changed?
  if (!propsEqual(oldNode.props, newNode.props)) {
    return [{ type: "UPDATE", node: newNode, at: computeRect(newNode) }];
  }
  
  // Diff children (keyed)
  const patches: Patch[] = [];
  const oldChildren = keyedMap(oldNode.children);
  const newChildren = keyedMap(newNode.children);
  
  for (const [key, newChild] of newChildren) {
    const oldChild = oldChildren.get(key);
    patches.push(...diff(oldChild || null, newChild));
  }
  
  // Deleted children
  for (const [key, oldChild] of oldChildren) {
    if (!newChildren.has(key)) {
      patches.push({ type: "DELETE", at: oldChild.layout! });
    }
  }
  
  return patches;
}
```

#### Patch Application

```typescript
function applyPatches(patches: Patch[], renderer: Renderer) {
  for (const patch of patches) {
    switch (patch.type) {
      case "CREATE":
        renderNode(patch.node, patch.at, renderer);
        break;
      
      case "UPDATE":
        renderer.clearRect(patch.at);
        renderNode(patch.node, patch.at, renderer);
        break;
      
      case "DELETE":
        renderer.clearRect(patch.at);
        break;
    }
  }
  
  renderer.flush();
}
```

### Pros & Cons

**✅ Pros**:
- **Pure functions**: Testable `update` and `view`
- **Centralized state**: Single source of truth
- **Clear event flow**: Messages make state changes explicit
- **Composable**: Trees compose naturally
- **Partial redraws**: Diff enables only patching changed subtrees
- **Scalable**: Good for complex multi-screen apps

**❌ Cons**:
- **Diffing overhead**: More computation than immediate mode
- **Initial complexity**: Users must learn TEA pattern
- **More code**: Reconciler implementation is non-trivial
- **Performance**: Can be slower if not optimized (needs dirty rects)

**When to use**: Complex apps with lots of state, multiple screens, need for testability and clear architecture.

---

## 📊 Comparison Matrix

| Feature | Current OOP | Immediate-Mode | Declarative Tree |
|---------|------------|----------------|------------------|
| **API Size** | Large (7+ classes) | Tiny (5 functions) | Small (6 functions) |
| **Composition** | Imperative `.add()` | Function nesting | Tree nesting |
| **State Management** | Internal + external | External only | TEA pattern |
| **Performance** | Medium (retained) | Fast (stateless) | Medium (diffing) |
| **Memory** | High (instances) | Low (per-frame) | Medium (2 trees) |
| **Event Handling** | Global maps | Return values | Message dispatch |
| **Learning Curve** | Low | Very low | Medium (TEA) |
| **Testability** | Hard | Medium | Easy (pure) |
| **Flexibility** | Medium | High | Very high |

---

## 🎯 Recommendations

### Start with Immediate-Mode (Approach A)
- **Best for**: Getting to <8ms quickly
- **Pros**: Smallest API, lowest overhead, easiest to implement
- **Migration**: Current OOP code can coexist during transition

### Upgrade to Declarative (Approach B) if needed
- **When**: App grows complex, need testability
- **Pros**: Better for large apps, clear architecture
- **Can build on top of A**: Use immediate-mode as rendering primitive

### Hybrid Approach (Best of Both)
```typescript
// Use declarative for structure
const tree = col({ key: "root" },
  text("Hello"),
  // Drop to immediate-mode for hot paths
  custom({ key: "chart" }, (ui) => {
    ui.row({}, () => {
      for (let i = 0; i < 1000; i++) {
        ui.text(`Item ${i}`);
      }
    });
  })
);
```

---

## 🚀 Migration Path

### Phase 1: Build Renderer Abstraction
```typescript
interface Renderer {
  fillRect(x: number, y: number, w: number, h: number, fg: number, bg: number): void;
  drawText(x: number, y: number, text: string, fg: number, bg: number): void;
  drawBorder(x: number, y: number, w: number, h: number, style: Border, fg: number, bg: number): void;
  flush(): void;
}
```

### Phase 2: Implement Immediate-Mode MVP
- Core context + layout stack
- `col`, `row`, `text` widgets
- Hit-testing and focus management
- Input handling

### Phase 3: Add Widgets
- `button`, `input`
- `checkbox`, `select`, `slider`

### Phase 4 (Optional): Declarative Layer
- Node constructors
- Keyed differ
- TEA harness
- Event system

---

## 📝 Example: Complex Form

### Immediate-Mode

```typescript
function renderForm() {
  ui.frame(() => {
    ui.col({ border: "square", gap: 1, pad: { x: 2, y: 1 } }, () => {
      ui.text("User Registration", { fg: cl.cyan });
      
      const name = ui.input("name", form.name, { 
        placeholder: "Name" 
      });
      if (name.changed) form.name = name.value;
      
      const email = ui.input("email", form.email, { 
        placeholder: "Email" 
      });
      if (email.changed) form.email = email.value;
      
      ui.row({ gap: 2 }, () => {
        if (ui.button("Submit", { fg: cl.white, bg: cl.green })) {
          submitForm(form);
        }
        if (ui.button("Cancel", { fg: cl.white, bg: cl.red })) {
          resetForm();
        }
      });
    });
  });
}
```

### Declarative

```typescript
const view = (model: FormModel) =>
  col({ border: "square", gap: 1, pad: { x: 2, y: 1 }, key: "form" },
    text("User Registration", { fg: cl.cyan }),
    
    input(model.name, {
      key: "name",
      placeholder: "Name",
      onChange: (value) => ({ type: "UpdateName", value })
    }),
    
    input(model.email, {
      key: "email",
      placeholder: "Email",
      onChange: (value) => ({ type: "UpdateEmail", value })
    }),
    
    row({ gap: 2, key: "actions" },
      button("Submit", {
        key: "submit",
        fg: cl.white,
        bg: cl.green,
        onClick: () => ({ type: "Submit" })
      }),
      button("Cancel", {
        key: "cancel",
        fg: cl.white,
        bg: cl.red,
        onClick: () => ({ type: "Cancel" })
      })
    )
  );
```

---

## 🔧 Implementation Effort

### Approach A: Immediate-Mode
- **Renderer abstraction**: 2-4 hours
- **Core context + layout**: 4-6 hours
- **Basic widgets**: 4-6 hours
- **Hit-testing + focus**: 3-4 hours
- **Input handling**: 2-3 hours
- **Total**: 1-3 days for MVP

### Approach B: Declarative Tree
- **Node constructors**: 1-2 hours
- **Keyed differ**: 6-8 hours
- **Patch application**: 3-4 hours
- **TEA harness**: 2-3 hours
- **Event system**: 3-4 hours
- **Total**: 3-5 days for MVP

### Hybrid Approach
- Build A first (1-3 days)
- Add B on top (2-3 days)
- **Total**: 3-6 days

---

## 🎨 Advanced Features (Future)

### Immediate-Mode Extensions
- `ui.beginGroup(id)` / `ui.endGroup()` for reusable components
- `ui.animated(id, value, duration)` for transitions
- `ui.table(id, data, columns)` for data grids
- `ui.chart(id, data, type)` for visualizations

### Declarative Extensions
- Effects: `effect(() => Msg, deps)` for async ops
- Subscriptions: `subscribe(source, (data) => Msg)`
- Routing: `route(path, view)`
- Middleware: `middleware(msg => msg')`

---

## 🏁 Conclusion

Both approaches are **vastly superior** to the current OOP API:

**Choose Immediate-Mode if**:
- You want the smallest, fastest API
- Performance is the top priority
- Your UI is relatively simple
- You prefer explicit state management

**Choose Declarative if**:
- You need complex state flows
- Testability is important
- You're building a large app
- You want clear architecture

**Best path**: Start with **Approach A (Immediate-Mode)** for quick wins, then optionally layer **Approach B (Declarative)** on top as your app grows.

Both maintain the <8ms performance goal while dramatically improving developer experience.
