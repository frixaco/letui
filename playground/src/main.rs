use std::fs;

use serde::Deserialize;
use taffy::prelude::*;

#[derive(Deserialize, Debug)]
struct Node {
    #[serde(rename = "type")]
    node_type: String,
    gap: f32,
    #[serde(rename = "paddingX")]
    padding_x: f32,
    #[serde(rename = "paddingY")]
    padding_y: f32,
    border: f32,
    text: String,
    children: Vec<Node>,
}

#[derive(Deserialize, Debug)]
struct Tree {
    node: Node,
    width: f32,
    height: f32,
}

fn get_styles(node: &Node) -> Style {
    Style {
        gap: Size {
            width: length(node.gap),
            height: zero(),
        },
        padding: Rect {
            left: length(node.padding_x),
            right: length(node.padding_x),
            top: length(node.padding_y),
            bottom: length(node.padding_y),
        },
        border: Rect {
            left: length(node.border),
            right: length(node.border),
            top: length(node.border),
            bottom: length(node.border),
        },
        ..Default::default()
    }
}

fn build_taffy_tree(taffy: &mut TaffyTree<()>, taffy_root: &NodeId, tree_node: &Node) {
    for child in &tree_node.children {
        let mut child_styles = get_styles(child);

        let flex_direction: Option<FlexDirection> = match child.node_type.as_str() {
            "column" => Some(FlexDirection::Column),
            "row" => Some(FlexDirection::Row),
            _ => None,
        };
        if let Some(fd) = flex_direction {
            child_styles.flex_direction = fd;
        };

        let taffy_child = taffy.new_leaf(child_styles).unwrap();
        taffy.add_child(*taffy_root, taffy_child).unwrap();

        build_taffy_tree(taffy, &taffy_child, child);
    }
}

fn build_frames_array(
    taffy: &mut TaffyTree<()>,
    node: NodeId,
    out: &mut Vec<f32>,
) -> taffy::TaffyResult<()> {
    let children = taffy.children(node).unwrap();
    let layout = taffy.layout(node).unwrap();

    if children.is_empty() {
        out.extend([
            layout.location.x,
            layout.location.y,
            layout.size.width,
            layout.size.height,
        ]);
    } else {
        for child in children {
            build_frames_array(taffy, child, out);
        }
    }

    Ok(())
}

fn main() -> Result<(), taffy::TaffyError> {
    let contents = fs::read_to_string("tree.json").unwrap().to_string();
    let tree = serde_json::from_str::<Tree>(&contents).unwrap();

    let mut taffy: TaffyTree<()> = TaffyTree::new();

    let node = &tree.node;

    let flex_direction: Option<FlexDirection> = match node.node_type.as_str() {
        "column" => Some(FlexDirection::Column),
        "row" => Some(FlexDirection::Row),
        _ => None,
    };

    let mut root_styles = get_styles(node);
    if let Some(fd) = flex_direction {
        root_styles.flex_direction = fd;
    };
    let root = taffy.new_leaf(root_styles).unwrap();

    build_taffy_tree(&mut taffy, &root, &tree.node);

    taffy
        .compute_layout(
            root,
            Size {
                width: length(tree.width),
                height: length(tree.height),
            },
        )
        .unwrap();
    taffy.print_tree(root);

    let mut frames: Vec<f32> = Vec::new();

    build_frames_array(&mut taffy, root, &mut frames).unwrap();

    println!("{:?}", Box::into_raw(Box::new(frames)));

    Ok(())
}
