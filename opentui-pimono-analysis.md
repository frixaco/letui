
Compare letui TUI library with opentui and pi-mono
Rustam A
·
2h
ago
smart
frixaco/letui:main
I'll use the Librarian to analyze both TUI libraries and compare them to your letui implementation.
Now I have comprehensive information on both libraries. Let me synthesize a comparison with your letui implementation.

Comprehensive TUI Library Comparison

Architecture Overview
Aspect	letui	OpenTUI	pi-mono
Layout Engine	Taffy (Rust FFI)	Yoga (JS binding)	None (1D width only)
Rendering	Rust buffer + diff	Zig native layer	Pure TS string diff
Reactivity	Signal-based ($, ff)	Manual requestRender()	Manual callbacks
Component Model	Functional factories	Class hierarchy	Interface-based
Efficiency Analysis
Your letui strengths:

FFI-based layout - Taffy in Rust avoids JS GC pressure during layout; OpenTUI's Yoga runs in JS heap
Signal auto-tracking - ff(() => {...}) automatically re-runs when dependencies change; both others require manual invalidation
Buffer diffing in Rust - Your first_flush/next_flush does cell-level comparison natively; pi-mono does line-level string comparison in JS
Potential inefficiencies in letui:

Serialization overhead - You call serialize(root) every frame, allocating Float32Array + TextEncoder. Pi-mono caches component output
Full tree walk - Your paint() walks entire tree; OpenTUI skips invisible children with _getVisibleChildren()
FFI boundary - Each api.calculate_layout() / api.flush() has call overhead (~0.1-0.5ms per call)
Layout Comparison
letui:         serialize → FFI → Taffy compute → frames array → paint
OpenTUI:       yogaNode tree → Yoga.calculateLayout() → render list
pi-mono:       component.render(width) → concatenate strings
Your approach is closest to OpenTUI but with native Taffy. Key difference: you rebuild the taffy tree every frame (parse_node in Rust), while OpenTUI mutates persistent Yoga nodes.

Optimization opportunity: Cache taffy tree structure, only update changed nodes.

API Usability
Feature	letui	OpenTUI	pi-mono
Component creation	Button({...})	new Button({...})	{render, handleInput}
Children	Signal-based $(children)	.add(child) imperative	Array property
State updates	signal(newValue)	this.prop = value; requestRender()	this.state = x; invalidate()
Focus management	node.focus()	Built-in focus system	Manual
Event handling	handlers: {onClick}	Method overrides	handleInput(data)
Your API is more declarative than both - signals abstract away the render scheduling. OpenTUI requires explicit requestRender(), pi-mono requires invalidate() + tui.requestRender().

What You Do Better
True reactivity - ff(() => {...}) with automatic dependency tracking beats manual invalidation
Declarative structure - Column({}, [Button({...})]) vs class instantiation chains
Native layout + rendering - Both layout (Taffy) and buffer ops (setCell/flush) in Rust
What They Do Better
OpenTUI:

Visibility culling (skips off-screen components)
Framework reconcilers (React, SolidJS support)
Rich component library
pi-mono:

Component-level render caching (cachedLines)
Simpler mental model (no hidden reactivity)
Zero FFI overhead
Recommendations for letui
Add render caching - Skip serialize/layout if signals unchanged (pi-mono pattern)
Incremental tree updates - Don't rebuild entire Taffy tree each frame
Visibility culling - Skip paint() for off-screen nodes
Batch signal updates - Your whenSettled is good; ensure it's used in hot paths
Added 4 optimization recommendations based on the comparison analysis.
Compare letui TUI library with opentui and pi-mono - Amp Docs
