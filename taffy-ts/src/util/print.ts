import type { Layout } from "../tree/layout.js";
import type { NodeId } from "../tree/taffy-tree.js";

type PrintableTree = {
    getFinalLayout(node: NodeId): Layout;
    getDebugLabel(node: NodeId): string;
    childCount(node: NodeId): number;
    childIds(node: NodeId): NodeId[];
};

export function printTree(tree: PrintableTree, root: NodeId): void {
    console.log(writeTree(tree, root));
}
export function print_tree(tree: PrintableTree, root: NodeId): void {
    printTree(tree, root);
}
export function writeTree(tree: PrintableTree, root: NodeId): string {
    const lines = ["TREE"];
    writeNode(lines, tree, root, false, "");
    return lines.join("\n");
}
export function write_tree(tree: PrintableTree, root: NodeId): string {
    return writeTree(tree, root);
}
function writeNode(lines: string[], tree: PrintableTree, node: NodeId, hasSibling: boolean, linesPrefix: string): void {
    const layout = tree.getFinalLayout(node);
    const display = tree.getDebugLabel(node);
    const childCount = tree.childCount(node);
    const fork = hasSibling ? "├── " : "└── ";
    lines.push(`${linesPrefix}${fork} ${display} ` +
        `[x: ${formatField(layout.location.x)} y: ${formatField(layout.location.y)} ` +
        `w: ${formatField(layout.size.width)} h: ${formatField(layout.size.height)} ` +
        `content_w: ${formatField(layout.contentSize.width)} content_h: ${formatField(layout.contentSize.height)} ` +
        `border: l:${layout.border.left} r:${layout.border.right} t:${layout.border.top} b:${layout.border.bottom}, ` +
        `padding: l:${layout.padding.left} r:${layout.padding.right} t:${layout.padding.top} b:${layout.padding.bottom}] ` +
        `(${node})`);
    const childPrefix = linesPrefix + (hasSibling ? "│   " : "    ");
    tree.childIds(node).forEach((child: NodeId, index: number) => {
        writeNode(lines, tree, child, index < childCount - 1, childPrefix);
    });
}
function formatField(value: unknown): string {
    return String(value).padEnd(4, " ");
}
