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
    let mut style = Style {
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
    };

    match node.node_type.as_str() {
        "column" => {
            style.flex_direction = FlexDirection::Column;
            style.align_items = Some(AlignItems::Stretch);
        }
        "row" => {
            style.flex_direction = FlexDirection::Row;
            style.align_items = Some(AlignItems::Stretch);
        }
        _ => {}
    }

    style
}

enum NodeContext {
    Text(String),
    Button(String),
    Container,
}

fn build_taffy_tree(taffy: &mut TaffyTree<NodeContext>, taffy_root: &NodeId, tree_node: &Node) {
    for child in &tree_node.children {
        let child_styles = get_styles(child);

        let taffy_child = taffy
            .new_leaf_with_context(
                child_styles,
                match child.node_type.as_str() {
                    "column" | "row" => NodeContext::Container,
                    "text" => NodeContext::Text(child.text.clone()),
                    "button" => NodeContext::Button(child.text.clone()),
                    _ => NodeContext::Container,
                },
            )
            .unwrap();
        taffy.add_child(*taffy_root, taffy_child).unwrap();

        build_taffy_tree(taffy, &taffy_child, child);
    }
}

fn build_frames_array(
    taffy: &mut TaffyTree<NodeContext>,
    node: NodeId,
    out: &mut Vec<f32>,
    offset_x: f32,
    offset_y: f32,
) {
    let layout = taffy.layout(node).unwrap();

    let absolute_x = offset_x + layout.location.x;
    let absolute_y = offset_y + layout.location.y;

    out.extend([
        absolute_x,
        absolute_y,
        layout.size.width,
        layout.size.height,
    ]);

    let children = taffy.children(node).unwrap();
    for child in children {
        build_frames_array(taffy, child, out, absolute_x, absolute_y);
    }
}

fn measure_function(
    known_dimensions: Size<Option<f32>>,
    _available_space: Size<AvailableSpace>,
    _node_id: NodeId,
    node_context: Option<&mut NodeContext>,
    style: &Style,
) -> Size<f32> {
    if let Size {
        width: Some(width),
        height: Some(height),
    } = known_dimensions
    {
        return Size { width, height };
    }

    match node_context {
        Some(NodeContext::Text(text)) | Some(NodeContext::Button(text)) => {
            let text_width = text.chars().count() as f32;

            Size {
                width: text_width,
                height: 1.0,
            }
        }
        _ => Size::ZERO,
    }
}

fn main() -> Result<(), taffy::TaffyError> {
    let contents = fs::read_to_string("tree.json").unwrap().to_string();
    let tree = serde_json::from_str::<Tree>(&contents).unwrap();

    let mut taffy: TaffyTree<NodeContext> = TaffyTree::new();

    let node = &tree.node;

    let mut root_styles = get_styles(node);
    root_styles.size = Size {
        width: length(tree.width),
        height: length(tree.height),
    };
    let root = taffy
        .new_leaf_with_context(
            root_styles,
            match node.node_type.as_str() {
                "text" => NodeContext::Text(node.text.clone()),
                "button" => NodeContext::Button(node.text.clone()),
                _ => NodeContext::Container,
            },
        )
        .unwrap();

    build_taffy_tree(&mut taffy, &root, &tree.node);

    taffy
        .compute_layout_with_measure(
            root,
            Size {
                width: length(tree.width),
                height: length(tree.height),
            },
            |known_dimensions, available_space, node_id, node_context, style| {
                measure_function(
                    known_dimensions,
                    available_space,
                    node_id,
                    node_context,
                    style,
                )
            },
        )
        .unwrap();
    taffy.print_tree(root);

    let mut frames: Vec<f32> = Vec::new();

    build_frames_array(&mut taffy, root, &mut frames, 0.0, 0.0);

    println!("{:?}", Box::into_raw(Box::new(frames)));

    Ok(())
}
