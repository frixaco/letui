import { Size } from "../geometry.js";
import { Display, Style, flexDirectionIsRow } from "../style/style.js";
import { computeBlockLayout } from "../compute/block.js";
import { computeRootLayout, roundLayout } from "../compute/common.js";
import { computeFlexboxLayout } from "../compute/flexbox.js";
import { computeGridLayout } from "../compute/grid.js";
import { computeLeafLayout } from "../compute/leaf.js";
import { printTree as printTaffyTree } from "../util/print.js";
import { Cache, ClearState } from "./cache.js";
import { Layout, LayoutInput, LayoutOutput, RunMode } from "./layout.js";

export type MeasureFunction<Context = any> = ((knownDimensions: Size, availableSpace: Size, nodeId: NodeId<Context>, nodeContext: Context | undefined, style: Style) => Size) & {
    isTaffyDefaultMeasure?: boolean;
};

type DetailedLayoutInfo =
    | { type: "None" }
    | { type: "Grid"; grid: unknown };

type TaffyNodeData = {
    style: Style;
    unroundedLayout: Layout;
    finalLayout: Layout;
    context: unknown;
    cache: Cache;
    detailedLayoutInfo: DetailedLayoutInfo;
};

type TaffyErrorKind =
    | "ChildIndexOutOfBounds"
    | "InvalidInputNode"
    | "InvalidParentNode"
    | "InvalidChildNode";

type TaffyErrorInit = {
    message: string;
    parent?: NodeId<unknown>;
    child?: NodeId<unknown>;
    node?: NodeId<unknown>;
    childIndex?: number;
    childCount?: number;
};

export class NodeId<Context = unknown> {
    value: number;
    declare readonly __context?: Context;
    static new(value: number): NodeId<unknown> {
        return new NodeId(value);
    }
    static from(value: number): NodeId<unknown> {
        return new NodeId(value);
    }
    constructor(value: number) {
        this.value = value;
    }
    toNumber(): number {
        return this.value;
    }
    valueOf(): number {
        return this.value;
    }
    equals(other: NodeId<unknown>): boolean {
        return this.value === other.value;
    }
    toString(): string {
        return `NodeId(${this.value})`;
    }
}
const defaultMeasureFunction: MeasureFunction<unknown> = Object.assign((_knownDimensions: Size, _availableSpace: Size, _nodeId: NodeId<unknown>, _nodeContext: unknown, _style: Style) => Size.zero(), { isTaffyDefaultMeasure: true });
export class TaffyError extends Error {
    static childIndexOutOfBounds(parent: NodeId<unknown>, childIndex: number, childCount: number): TaffyError {
        return new TaffyError("ChildIndexOutOfBounds", {
            parent,
            childIndex,
            childCount,
            message: `Index (is ${childIndex}) should be < child_count (${childCount}) for parent node ${parent}`,
        });
    }
    static invalidInputNode(node: NodeId<unknown>): TaffyError {
        return new TaffyError("InvalidInputNode", {
            node,
            message: `Supplied Node ${node} is not in the TaffyTree instance`,
        });
    }
    static invalidParentNode(parent: NodeId<unknown>): TaffyError {
        return new TaffyError("InvalidParentNode", {
            parent,
            message: `Parent Node ${parent} is not in the TaffyTree instance`,
        });
    }
    static invalidChildNode(child: NodeId<unknown>): TaffyError {
        return new TaffyError("InvalidChildNode", {
            child,
            message: `Child Node ${child} is not in the TaffyTree instance`,
        });
    }
    kind: TaffyErrorKind;
    parent?: NodeId<unknown>;
    child?: NodeId<unknown>;
    node?: NodeId<unknown>;
    childIndex?: number;
    childCount?: number;
    constructor(kind: TaffyErrorKind, init: TaffyErrorInit) {
        super(init.message);
        this.name = "TaffyError";
        this.kind = kind;
        this.parent = init.parent;
        this.child = init.child;
        this.node = init.node;
        this.childIndex = init.childIndex;
        this.childCount = init.childCount;
    }
}
export class TaffyTree {
    nodes = new Map<number, TaffyNodeData>();
    childrenByNode = new Map<number, NodeId<unknown>[]>();
    parents = new Map<number, NodeId<unknown> | undefined>();
    nextNode: number = 0;
    useRounding: boolean = true;
    static new(): TaffyTree {
        return new TaffyTree();
    }
    static default(): TaffyTree {
        return TaffyTree.new();
    }
    static withCapacity(_capacity: number): TaffyTree {
        return new TaffyTree();
    }
    static with_capacity(capacity: number): TaffyTree {
        return TaffyTree.withCapacity(capacity);
    }
    enableRounding(): void {
        this.useRounding = true;
    }
    enable_rounding(): void {
        this.enableRounding();
    }
    disableRounding(): void {
        this.useRounding = false;
    }
    disable_rounding(): void {
        this.disableRounding();
    }
    newLeaf(style: Style = Style.default()): NodeId<undefined> {
        return this.insertNode(style, [], undefined);
    }
    new_leaf(style: Style = Style.default()): NodeId<undefined> {
        return this.newLeaf(style);
    }
    newLeafWithContext<Context>(style: Style, context: Context): NodeId<Context> {
        return this.insertNode(style, [], context);
    }
    new_leaf_with_context<Context>(style: Style, context: Context): NodeId<Context> {
        return this.newLeafWithContext(style, context);
    }
    newWithChildren(style: Style, children: NodeId<unknown>[]): NodeId<undefined> {
        for (const child of children)
            this.assertChildNode(child);
        return this.insertNode(style, children, undefined);
    }
    new_with_children(style: Style, children: NodeId<unknown>[]): NodeId<undefined> {
        return this.newWithChildren(style, children);
    }
    clear(): void {
        this.nodes.clear();
        this.childrenByNode.clear();
        this.parents.clear();
    }
    remove<Context>(node: NodeId<Context>): NodeId<Context> {
        this.assertNode(node);
        const parent = this.parents.get(node.value);
        if (parent !== undefined) {
            this.childrenByNode.set(parent.value, this.childrenRef(parent).filter((child) => child.value !== node.value));
        }
        for (const child of this.childrenByNode.get(node.value) ?? []) {
            this.parents.set(child.value, undefined);
        }
        this.nodes.delete(node.value);
        this.childrenByNode.delete(node.value);
        this.parents.delete(node.value);
        return node;
    }
    setNodeContext<Context>(node: NodeId<Context>, context: Context): void {
        this.assertNode(node).context = context;
        this.markDirtyAncestors(node);
    }
    set_node_context<Context>(node: NodeId<Context>, context: Context): void {
        this.setNodeContext(node, context);
    }
    getNodeContext<Context>(node: NodeId<Context>): Context | undefined {
        return this.nodes.get(node.value)?.context as Context | undefined;
    }
    get_node_context<Context>(node: NodeId<Context>): Context | undefined {
        return this.getNodeContext(node);
    }
    getNodeContextMut<Context>(node: NodeId<Context>): Context | undefined {
        return this.getNodeContext(node);
    }
    get_node_context_mut<Context>(node: NodeId<Context>): Context | undefined {
        return this.getNodeContextMut(node);
    }
    getDisjointNodeContextMut<Context>(nodes: NodeId<Context>[]): Context[] | undefined {
        const seen = new Set<number>();
        const contexts: Context[] = [];
        for (const node of nodes) {
            if (seen.has(node.value))
                return undefined;
            seen.add(node.value);
            const context = this.nodes.get(node.value)?.context as Context | undefined;
            if (context === undefined)
                return undefined;
            contexts.push(context);
        }
        return contexts;
    }
    get_disjoint_node_context_mut<Context>(nodes: NodeId<Context>[]): Context[] | undefined {
        return this.getDisjointNodeContextMut(nodes);
    }
    addChild(parent: NodeId<unknown>, child: NodeId<unknown>): void {
        this.assertParentNode(parent);
        this.assertChildNode(child);
        this.parents.set(child.value, parent);
        this.childrenRef(parent).push(child);
        this.markDirty(parent);
    }
    add_child(parent: NodeId<unknown>, child: NodeId<unknown>): void {
        this.addChild(parent, child);
    }
    insertChildAtIndex(parent: NodeId<unknown>, childIndex: number, child: NodeId<unknown>): void {
        this.assertParentNode(parent);
        this.assertChildNode(child);
        const children = this.childrenRef(parent);
        if (childIndex > children.length)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        this.parents.set(child.value, parent);
        children.splice(childIndex, 0, child);
        this.markDirty(parent);
    }
    insert_child_at_index(parent: NodeId<unknown>, childIndex: number, child: NodeId<unknown>): void {
        this.insertChildAtIndex(parent, childIndex, child);
    }
    setChildren(parent: NodeId<unknown>, children: NodeId<unknown>[]): void {
        this.assertParentNode(parent);
        for (const child of children)
            this.assertChildNode(child);
        for (const child of this.childrenRef(parent)) {
            this.parents.set(child.value, undefined);
        }
        for (const child of children) {
            const previousParent = this.parents.get(child.value);
            if (previousParent !== undefined)
                this.removeChild(previousParent, child);
            this.parents.set(child.value, parent);
        }
        this.childrenByNode.set(parent.value, [...children]);
        this.markDirty(parent);
    }
    set_children(parent: NodeId<unknown>, children: NodeId<unknown>[]): void {
        this.setChildren(parent, children);
    }
    removeChild<Context>(parent: NodeId<unknown>, child: NodeId<Context>): NodeId<Context> {
        this.assertParentNode(parent);
        this.assertChildNode(child);
        const children = this.childrenByNode.get(parent.value) ?? [];
        const index = children.findIndex((candidate) => candidate.value === child.value);
        if (index < 0)
            throw TaffyError.invalidInputNode(child);
        return this.removeChildAtIndex(parent, index) as NodeId<Context>;
    }
    remove_child<Context>(parent: NodeId<unknown>, child: NodeId<Context>): NodeId<Context> {
        return this.removeChild(parent, child);
    }
    removeChildAtIndex(parent: NodeId<unknown>, childIndex: number): NodeId<unknown> {
        this.assertParentNode(parent);
        const children = this.childrenRef(parent);
        if (childIndex >= children.length)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        const [child] = children.splice(childIndex, 1);
        if (child === undefined)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        this.parents.set(child.value, undefined);
        this.markDirty(parent);
        return child;
    }
    remove_child_at_index(parent: NodeId<unknown>, childIndex: number): NodeId<unknown> {
        return this.removeChildAtIndex(parent, childIndex);
    }
    removeChildrenRange(parent: NodeId<unknown>, start: number, endExclusive: number): void {
        this.assertParentNode(parent);
        const children = this.childrenRef(parent);
        const startIndex = clampRangeIndex(start, children.length);
        const endIndex = clampRangeIndex(endExclusive, children.length);
        if (endIndex < startIndex)
            throw new RangeError("removeChildrenRange end must be greater than or equal to start");
        const removed = children.splice(startIndex, endIndex - startIndex);
        for (const child of removed) {
            this.parents.set(child.value, undefined);
        }
        this.markDirty(parent);
    }
    remove_children_range(parent: NodeId<unknown>, start: number, endExclusive: number): void {
        this.removeChildrenRange(parent, start, endExclusive);
    }
    replaceChildAtIndex<Context>(parent: NodeId<unknown>, childIndex: number, newChild: NodeId<Context>): NodeId<unknown> {
        this.assertParentNode(parent);
        this.assertChildNode(newChild);
        const children = this.childrenRef(parent);
        if (childIndex >= children.length)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        const oldChild = children[childIndex];
        if (oldChild === undefined)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        children[childIndex] = newChild;
        this.parents.set(oldChild.value, undefined);
        this.parents.set(newChild.value, parent);
        this.markDirty(parent);
        return oldChild;
    }
    replace_child_at_index<Context>(parent: NodeId<unknown>, childIndex: number, newChild: NodeId<Context>): NodeId<unknown> {
        return this.replaceChildAtIndex(parent, childIndex, newChild);
    }
    childAtIndex(parent: NodeId<unknown>, childIndex: number): NodeId<unknown> {
        this.assertParentNode(parent);
        const children = this.childrenRef(parent);
        if (childIndex >= children.length)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        const child = children[childIndex];
        if (child === undefined)
            throw TaffyError.childIndexOutOfBounds(parent, childIndex, children.length);
        return child;
    }
    child_at_index(parent: NodeId<unknown>, childIndex: number): NodeId<unknown> {
        return this.childAtIndex(parent, childIndex);
    }
    childCount(parent: NodeId<unknown>): number {
        this.assertParentNode(parent);
        return this.childrenRef(parent).length;
    }
    child_count(parent: NodeId<unknown>): number {
        return this.childCount(parent);
    }
    getChildId(parent: NodeId<unknown>, childIndex: number): NodeId<unknown> {
        return this.childAtIndex(parent, childIndex);
    }
    get_child_id(parent: NodeId<unknown>, childIndex: number): NodeId<unknown> {
        return this.getChildId(parent, childIndex);
    }
    totalNodeCount(): number {
        return this.nodes.size;
    }
    total_node_count(): number {
        return this.totalNodeCount();
    }
    parent(child: NodeId<unknown>): NodeId<unknown> | undefined {
        this.assertNode(child);
        return this.parents.get(child.value);
    }
    children(parent: NodeId<unknown>): NodeId<unknown>[] {
        this.assertParentNode(parent);
        return [...this.childrenRef(parent)];
    }
    setStyle(node: NodeId<unknown>, style: Style): void {
        this.assertNode(node).style = style;
        this.markDirtyAncestors(node);
    }
    set_style(node: NodeId<unknown>, style: Style): void {
        this.setStyle(node, style);
    }
    style(node: NodeId<unknown>): Style {
        return this.assertNode(node).style;
    }
    layout(node: NodeId<unknown>): Layout {
        const data = this.assertNode(node);
        return this.useRounding ? data.finalLayout : data.unroundedLayout;
    }
    unroundedLayout(node: NodeId<unknown>): Layout {
        return this.assertNode(node).unroundedLayout;
    }
    unrounded_layout(node: NodeId<unknown>): Layout {
        return this.unroundedLayout(node);
    }
    markDirty(node: NodeId<unknown>): void {
        let current: NodeId<unknown> | undefined = node;
        while (current !== undefined) {
            const data = this.assertNode(current);
            const clearState = data.cache.clear();
            if (clearState === ClearState.AlreadyEmpty)
                break;
            current = this.parents.get(current.value);
        }
    }
    mark_dirty(node: NodeId<unknown>): void {
        this.markDirty(node);
    }
    markDirtyAncestors(node: NodeId<unknown>): void {
        let current: NodeId<unknown> | undefined = node;
        while (current !== undefined) {
            this.assertNode(current).cache.clear();
            current = this.parents.get(current.value);
        }
    }
    dirty(node: NodeId<unknown>): boolean {
        return this.assertNode(node).cache.isEmpty();
    }
    computeLayout(node: NodeId<unknown>, availableSpace: Size): void {
        this.computeLayoutWithMeasure(node, availableSpace, defaultMeasureFunction);
    }
    compute_layout(node: NodeId<unknown>, availableSpace: Size): void {
        this.computeLayout(node, availableSpace);
    }
    computeLayoutWithMeasure<Context = any>(node: NodeId<unknown>, availableSpace: Size, measureFunction: MeasureFunction<Context>): void {
        computeRootLayout({
            getCoreContainerStyle: (nodeId) => this.getCoreContainerStyle(nodeId),
            computeChildLayout: (nodeId, input) => this.computeChildLayout(nodeId, input, measureFunction),
            setUnroundedLayout: (nodeId, layout) => this.setUnroundedLayout(nodeId, layout),
            resolveCalcValue: (value, basis) => this.resolveCalcValue(value, basis),
        }, node, availableSpace);
        if (this.useRounding) {
            roundLayout(this, node);
        }
    }
    compute_layout_with_measure<Context = any>(node: NodeId<unknown>, availableSpace: Size, measureFunction: MeasureFunction<Context>): void {
        this.computeLayoutWithMeasure(node, availableSpace, measureFunction);
    }
    printTree(root: NodeId<unknown>): void {
        printTaffyTree(this, root);
    }
    print_tree(root: NodeId<unknown>): void {
        this.printTree(root);
    }
    childIds(node: NodeId<unknown>): NodeId<unknown>[] {
        return this.children(node);
    }
    child_ids(node: NodeId<unknown>): NodeId<unknown>[] {
        return this.childIds(node);
    }
    cacheGet(node: NodeId<unknown>, input: LayoutInput): LayoutOutput | undefined {
        return this.assertNode(node).cache.get(input);
    }
    cache_get(node: NodeId<unknown>, input: LayoutInput): LayoutOutput | undefined {
        return this.cacheGet(node, input);
    }
    cacheGetExact(node: NodeId<unknown>, input: LayoutInput): LayoutOutput | undefined {
        return this.assertNode(node).cache.getExact(input);
    }
    cache_get_exact(node: NodeId<unknown>, input: LayoutInput): LayoutOutput | undefined {
        return this.cacheGetExact(node, input);
    }
    cacheStore(node: NodeId<unknown>, input: LayoutInput, layoutOutput: LayoutOutput): void {
        this.assertNode(node).cache.store(input, layoutOutput);
    }
    cache_store(node: NodeId<unknown>, input: LayoutInput, layoutOutput: LayoutOutput): void {
        this.cacheStore(node, input, layoutOutput);
    }
    cacheClear(node: NodeId<unknown>): void {
        this.assertNode(node).cache.clear();
    }
    cache_clear(node: NodeId<unknown>): void {
        this.cacheClear(node);
    }
    getStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_style(node: NodeId<unknown>): Style {
        return this.getStyle(node);
    }
    getCoreContainerStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_core_container_style(node: NodeId<unknown>): Style {
        return this.getCoreContainerStyle(node);
    }
    resolveCalcValue(_value: unknown, _basis: number): number {
        return 0;
    }
    resolve_calc_value(value: unknown, basis: number): number {
        return this.resolveCalcValue(value, basis);
    }
    getFlexboxContainerStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_flexbox_container_style(node: NodeId<unknown>): Style {
        return this.getFlexboxContainerStyle(node);
    }
    getFlexboxChildStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_flexbox_child_style(node: NodeId<unknown>): Style {
        return this.getFlexboxChildStyle(node);
    }
    getGridContainerStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_grid_container_style(node: NodeId<unknown>): Style {
        return this.getGridContainerStyle(node);
    }
    getGridChildStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_grid_child_style(node: NodeId<unknown>): Style {
        return this.getGridChildStyle(node);
    }
    setDetailedGridInfo(node: NodeId<unknown>, detailedGridInfo: unknown): void {
        this.assertNode(node).detailedLayoutInfo = { type: "Grid", grid: detailedGridInfo };
    }
    set_detailed_grid_info(node: NodeId<unknown>, detailedGridInfo: unknown): void {
        this.setDetailedGridInfo(node, detailedGridInfo);
    }
    getBlockContainerStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_block_container_style(node: NodeId<unknown>): Style {
        return this.getBlockContainerStyle(node);
    }
    getBlockChildStyle(node: NodeId<unknown>): Style {
        return this.style(node);
    }
    get_block_child_style(node: NodeId<unknown>): Style {
        return this.getBlockChildStyle(node);
    }
    getUnroundedLayout(node: NodeId<unknown>): Layout {
        return this.unroundedLayout(node);
    }
    get_unrounded_layout(node: NodeId<unknown>): Layout {
        return this.getUnroundedLayout(node);
    }
    setUnroundedLayout(node: NodeId<unknown>, layout: Layout): void {
        this.assertNode(node).unroundedLayout = layout;
    }
    set_unrounded_layout(node: NodeId<unknown>, layout: Layout): void {
        this.setUnroundedLayout(node, layout);
    }
    setFinalLayout(node: NodeId<unknown>, layout: Layout): void {
        this.assertNode(node).finalLayout = layout;
    }
    set_final_layout(node: NodeId<unknown>, layout: Layout): void {
        this.setFinalLayout(node, layout);
    }
    getDebugLabel(node: NodeId<unknown>): string {
        const data = this.assertNode(node);
        const childCount = this.childCount(node);
        if (data.style.display === Display.None)
            return "NONE";
        if (childCount === 0)
            return "LEAF";
        if (data.style.display === Display.Block)
            return "BLOCK";
        if (data.style.display === Display.Flex) {
            return flexDirectionIsRow(data.style.flexDirection) ? "FLEX ROW" : "FLEX COL";
        }
        if (data.style.display === Display.Grid)
            return "GRID";
        return "LEAF";
    }
    get_debug_label(node: NodeId<unknown>): string {
        return this.getDebugLabel(node);
    }
    getFinalLayout(node: NodeId<unknown>): Layout {
        return this.layout(node);
    }
    get_final_layout(node: NodeId<unknown>): Layout {
        return this.getFinalLayout(node);
    }
    detailedLayoutInfo(node: NodeId<unknown>): DetailedLayoutInfo {
        return this.assertNode(node).detailedLayoutInfo;
    }
    detailed_layout_info(node: NodeId<unknown>): DetailedLayoutInfo {
        return this.detailedLayoutInfo(node);
    }
    insertNode<Context>(style: Style, children: NodeId<unknown>[], context: Context): NodeId<Context> {
        const id = new NodeId<Context>(this.nextNode++);
        this.nodes.set(id.value, {
            style,
            unroundedLayout: Layout.new(),
            finalLayout: Layout.new(),
            context,
            cache: new Cache(),
            detailedLayoutInfo: { type: "None" },
        });
        this.childrenByNode.set(id.value, [...children]);
        this.parents.set(id.value, undefined);
        for (const child of children)
            this.parents.set(child.value, id);
        return id;
    }
    computeChildLayout<Context = any>(node: NodeId<unknown>, input: LayoutInput, measureFunction: MeasureFunction<Context> = defaultMeasureFunction as MeasureFunction<Context>): LayoutOutput {
        const data = this.assertNode(node);
        if (input.runMode === RunMode.PerformHiddenLayout) {
            data.cache.clear();
            this.setLayouts(node, Layout.withOrder(0));
            for (const child of this.childrenRef(node)) {
                this.computeChildLayout(child, LayoutInput.hidden(), measureFunction);
            }
            return LayoutOutput.hidden();
        }
        const cached = data.cache.get(input);
        if (cached !== undefined)
            return cached;
        if (data.style.display === Display.None) {
            data.cache.clear();
            this.setLayouts(node, Layout.withOrder(0));
            for (const child of this.childrenRef(node)) {
                this.computeChildLayout(child, LayoutInput.hidden(), measureFunction);
            }
            const output = LayoutOutput.hidden();
            data.cache.store(input, output);
            return output;
        }
        const children = this.childrenRef(node);
        if (children.length > 0 && data.style.display === Display.Flex) {
            const output = computeFlexboxLayout(this, node, input, measureFunction);
            data.cache.store(input, output);
            return output;
        }
        if (children.length > 0 && data.style.display === Display.Block) {
            const output = computeBlockLayout(this, node, input, measureFunction);
            data.cache.store(input, output);
            return output;
        }
        if (children.length > 0 && data.style.display === Display.Grid) {
            const output = computeGridLayout(this, node, input, measureFunction);
            data.cache.store(input, output);
            return output;
        }
        if (children.length > 0) {
            throw new Error(`${String(data.style.display)} is not a supported display mode`);
        }
        const output = computeLeafLayout(input, data.style, (knownDimensions, availableSpace) => measureFunction(knownDimensions, availableSpace, node as NodeId<Context>, data.context as Context | undefined, data.style), this);
        data.cache.store(input, output);
        return output;
    }
    compute_child_layout<Context = any>(node: NodeId<unknown>, input: LayoutInput, measureFunction: MeasureFunction<Context> = defaultMeasureFunction as MeasureFunction<Context>): LayoutOutput {
        return this.computeChildLayout(node, input, measureFunction);
    }
    setLayouts(node: NodeId<unknown>, layout: Layout): void {
        const data = this.assertNode(node);
        data.unroundedLayout = layout;
        data.finalLayout = layout;
    }
    assertNode(node: NodeId<unknown>): TaffyNodeData {
        const data = this.nodes.get(node.value);
        if (data === undefined)
            throw TaffyError.invalidInputNode(node);
        return data;
    }
    assertParentNode(parent: NodeId<unknown>): TaffyNodeData {
        const data = this.nodes.get(parent.value);
        if (data === undefined)
            throw TaffyError.invalidParentNode(parent);
        return data;
    }
    assertChildNode(child: NodeId<unknown>): TaffyNodeData {
        const data = this.nodes.get(child.value);
        if (data === undefined)
            throw TaffyError.invalidChildNode(child);
        return data;
    }
    childrenRef(parent: NodeId<unknown>): NodeId<unknown>[] {
        const children = this.childrenByNode.get(parent.value);
        if (children === undefined)
            throw TaffyError.invalidParentNode(parent);
        return children;
    }
}
function clampRangeIndex(index: number, length: number): number {
    if (!Number.isInteger(index))
        throw new RangeError("range index must be an integer");
    if (index < 0 || index > length)
        throw new RangeError(`range index ${index} is outside 0..${length}`);
    return index;
}
