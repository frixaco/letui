import { describe, expect, test } from "bun:test";
import { Button, Column, ScrollView, Text } from "../src/components.ts";
import { Renderer } from "../src/renderer.ts";
import { CellBuffer } from "../src/surface.ts";

describe("Renderer", () => {
  test("lays out and paints the live component tree", () => {
    const label = Text({ text: "hello", foreground: 0xabcdef });
    const root = Column({}, [label]);
    const buffer = new CellBuffer(10, 4);

    const result = new Renderer().render(root, 10, 4, buffer);

    expect(root.frame).toEqual({ x: 0, y: 0, width: 10, height: 4 });
    expect(label.frame).toEqual({ x: 0, y: 0, width: 10, height: 1 });
    expect(String.fromCodePoint(...buffer.chars.slice(0, 5))).toBe("hello");
    expect(buffer.foreground[0]).toBe(0xabcdef);
    expect(result.registry.get(label.id)).toBe(label);
  });

  test("interprets axis pairs as vertical then horizontal", () => {
    const label = Text({ text: "x" });
    const root = Column({ padding: "1 2" }, [label]);

    new Renderer().render(root, 10, 4, new CellBuffer(10, 4));

    expect(root.contentFrame).toEqual({ x: 2, y: 1, width: 6, height: 2 });
    expect(label.frame.x).toBe(2);
    expect(label.frame.y).toBe(1);
  });

  test("updates styles and text without rebuilding component identity", () => {
    const label = Text({ text: "one" });
    const root = Column({}, [label]);
    const buffer = new CellBuffer(8, 2);
    const renderer = new Renderer();
    renderer.render(root, 8, 2, buffer);

    label.setText("two");
    label.setStyle({ foreground: 0x123456 });
    renderer.render(root, 8, 2, buffer);

    expect(String.fromCodePoint(...buffer.chars.slice(0, 3))).toBe("two");
    expect(buffer.foreground[0]).toBe(0x123456);
  });

  test("rebuilds the internal tree when component shape changes", () => {
    const first = Text({ text: "first" });
    const root = Column({}, [first]);
    const renderer = new Renderer();
    const buffer = new CellBuffer(10, 3);
    renderer.render(root, 10, 3, buffer);

    const second = Text({ text: "second" });
    root.setChildren([second]);
    const result = renderer.render(root, 10, 3, buffer);

    expect(result.registry.has(first.id)).toBe(false);
    expect(result.registry.get(second.id)).toBe(second);
    expect(String.fromCodePoint(...buffer.chars.slice(0, 6))).toBe("second");
  });

  test("fills interactive and scroll hitmaps", () => {
    const button = Button({ text: "go", onClick() {} });
    const viewport = ScrollView({ height: 2 }, [
      button,
      Text({ text: "next" }),
      Text({ text: "last" }),
    ]);
    const root = Column({}, [viewport]);
    const buffer = new CellBuffer(8, 4);
    const result = new Renderer().render(root, 8, 4, buffer);

    expect(result.hitmap[0]).toBe(button.id);
    expect(result.scrollHitmap[0]).toBe(viewport.id);
    expect(viewport.maxScrollY()).toBeGreaterThan(0);
  });

  test("scrolling moves paint while preserving logical frames", () => {
    const first = Text({ text: "first" });
    const second = Text({ text: "second" });
    const viewport = ScrollView({ height: 1 }, [first, second]);
    const root = Column({}, [viewport]);
    const buffer = new CellBuffer(8, 2);
    const renderer = new Renderer();
    renderer.render(root, 8, 2, buffer);
    const logicalY = second.frame.y;

    viewport.scrollTo(1);
    renderer.render(root, 8, 2, buffer);

    expect(String.fromCodePoint(...buffer.chars.slice(0, 6))).toBe("second");
    expect(second.frame.y).toBe(logicalY);
  });
});
