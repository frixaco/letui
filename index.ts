/**
 * Wrapper for the Rust backend of my TUI library
 * that exposes composable components for UI
 */

import {
	dlopen,
	FFIType,
	ptr,
	suffix,
	toArrayBuffer,
	type Pointer,
} from "bun:ffi";
import { COLORS } from "./colors";

const cl = COLORS.default;

const prefix = process.platform === "win32" ? "" : "lib";
const path = `./letui-ffi/target/release/${prefix}letui_ffi.${suffix}`;

const {
	symbols: {
		init_buffer,
		get_buffer_ptr,
		get_buffer_len,
		get_width,
		get_height,
		free_buffer,
		debug_buffer,
		init_letui,
		deinit_letui,
		flush,
		update_terminal_size,
	},
} = dlopen(path, {
	init_letui: {
		args: [],
		returns: FFIType.i32,
	},
	deinit_letui: {
		args: [],
		returns: FFIType.i32,
	},
	init_buffer: {
		args: [],
		returns: FFIType.i32,
	},
	get_buffer_ptr: {
		args: [],
		returns: FFIType.pointer,
	},
	get_buffer_len: {
		args: [],
		returns: FFIType.u64,
	},
	get_width: {
		args: [],
		returns: FFIType.u16,
	},
	get_height: {
		args: [],
		returns: FFIType.u16,
	},
	free_buffer: {
		args: [],
		returns: FFIType.i32,
	},
	debug_buffer: {
		args: [FFIType.u64],
		returns: FFIType.u64,
	},
	flush: {
		args: [],
		returns: FFIType.i32,
	},
	update_terminal_size: {
		args: [],
		returns: FFIType.i32,
	},
});

init_buffer();

const getBuffer = () => {
	const bufPtr = get_buffer_ptr()!;
	const bufLen = Number(get_buffer_len()!);

	return new BigUint64Array(toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8));
};

let buffer = getBuffer();

let terminalWidth = get_width();
let terminalHeight = get_height();

init_letui();
process.stdin.resume();
process.stdin.on("data", (data) => {
	if (data.toString() === "q") {
		free_buffer();
		deinit_letui();
		process.exit(0);
	} else {
	}
});
process.stdout.on("resize", () => {
	update_terminal_size();
	terminalWidth = get_width();
	terminalHeight = get_height();

	free_buffer();
	init_buffer();
	buffer = getBuffer();

	v.render();
});

type Border = "none" | "square" | "rounded";
type Justify = "start" | "end";

class View {
	children: (Column | Row | Text)[] = [];

	constructor() {}

	add(child: Column | Row | Text) {
		this.children.push(child);

		return this;
	}

	render() {
		let x = 0;
		let y = 0;
		for (const child of this.children) {
			child.render(x, y, { w: terminalWidth, h: terminalHeight });
			y += child.size().h;
			x = child.size().w > x ? child.size().w : x;
		}

		flush();
	}
}

class Row {
	children: (Column | Row | Text)[] = [];

	border: Border = "none";
	justify: Justify = "start";

	constructor(border: Border = "none", justify: Justify = "start") {
		this.border = border;
		this.justify = justify;
	}

	add(child: Column | Row | Text) {
		this.children.push(child);
		return this;
	}

	size() {
		let w = 0;
		let h = 0;

		for (const c of this.children) {
			w += c.size().w;
			h = c.size().h > h ? c.size().h : h;
		}

		return {
			w: w + (this.border !== "none" ? 2 : 0),
			h: h + (this.border !== "none" ? 2 : 0),
		};
	}

	render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
		if (this.border === "square") {
			let topLeft = yo * terminalWidth + xo + 1;
			let fg = cl.fg;
			let bg = cl.bg;

			let cells: bigint[] = [];
			for (let i = 0; i < w - 2; i++) {
				cells.push(BigInt("─".codePointAt(0)!), BigInt(fg), BigInt(bg));
			}
			let prebuilt = new BigUint64Array(cells);

			buffer.set(prebuilt, topLeft * 3);

			let bottomLeft =
				yo * terminalWidth + xo + terminalWidth * (this.size().h - 1) + 1;
			buffer.set(prebuilt, bottomLeft * 3);

			topLeft -= 1;
			bottomLeft -= 1;
			buffer.set(
				new BigUint64Array([
					BigInt("┌".codePointAt(0)!),
					BigInt(fg),
					BigInt(bg),
				]),
				topLeft * 3,
			);
			buffer.set(
				new BigUint64Array([
					BigInt("└".codePointAt(0)!),
					BigInt(fg),
					BigInt(bg),
				]),
				bottomLeft * 3,
			);

			let middleLeft = topLeft + terminalWidth;
			let topRight = topLeft + w - 1;
			let middleRight = topRight + terminalWidth;
			let bottomRight = middleRight + terminalWidth;

			buffer.set(
				new BigUint64Array([
					BigInt("│".codePointAt(0)!),
					BigInt(fg),
					BigInt(bg),
				]),
				middleLeft * 3,
			);

			buffer.set(
				new BigUint64Array([
					BigInt("┐".codePointAt(0)!),
					BigInt(fg),
					BigInt(bg),
				]),
				topRight * 3,
			);
			buffer.set(
				new BigUint64Array([
					BigInt("│".codePointAt(0)!),
					BigInt(fg),
					BigInt(bg),
				]),
				middleRight * 3,
			);
			buffer.set(
				new BigUint64Array([
					BigInt("┘".codePointAt(0)!),
					BigInt(fg),
					BigInt(bg),
				]),
				bottomRight * 3,
			);
		}

		let pad = 0;
		if (this.justify === "end") {
			pad = w - this.size().w;
		}
		let cx = pad + (this.border !== "none" ? 1 : 0);
		for (const c of this.children) {
			c.render(cx + xo, yo + (this.border !== "none" ? 1 : 0), {
				w: w - (this.border !== "none" ? 2 : 0),
				h: h - (this.border !== "none" ? 2 : 0),
			});
			cx += c.size().w;
		}
	}
}

class Column {
	children: (Column | Row | Text)[] = [];

	border: Border = "none";
	justify: Justify = "start";

	constructor(border: Border = "none", justify: Justify = "start") {
		this.border = border;
		this.justify = justify;
	}

	add(child: Column | Row | Text) {
		this.children.push(child);
		return this;
	}

	size() {
		let w = 0;
		let h = 0;

		for (const c of this.children) {
			w = c.size().w > w ? c.size().w : w;
			h += c.size().h;
		}

		return {
			w: w + (this.border !== "none" ? 2 : 0),
			h: h + (this.border !== "none" ? 2 : 0),
		};
	}

	render(xo: number, yo: number, { w, h }: { w: number; h: number }) {
		let cy = this.border !== "none" ? 1 : 0;
		if (this.justify === "end") {
			cy = h - this.size().h;
		}

		for (const c of this.children) {
			c.render(xo, cy + yo, {
				w: w - (this.border !== "none" ? 2 : 0),
				h: h - (this.border !== "none" ? 2 : 0),
			});
			cy += c.size().h;
		}
	}
}

class Text {
	text: string;
	fg: number;
	bg: number;

	border: Border = "none";
	prebuilt: BigUint64Array = new BigUint64Array();

	width: number;
	height: number;

	constructor(text: string, fg: number, bg: number, border: Border = "none") {
		this.border = border;
		this.width = [...text].length + (border !== "none" ? 2 : 0);
		this.height = 1;

		this.text = text;
		this.fg = fg;
		this.bg = bg;

		this.prerender();
	}

	prerender() {
		const cells: bigint[] = [];
		for (const c of this.text) {
			cells.push(BigInt(c.codePointAt(0)!), BigInt(this.fg), BigInt(this.bg));
		}
		this.prebuilt = new BigUint64Array(cells);
	}

	size() {
		return { w: this.width, h: this.height };
	}

	render(xo: number, yo: number) {
		const cursor = terminalWidth * yo + xo;
		buffer.set(this.prebuilt.subarray(0), cursor * 3);
	}
}

const v = new View();
const c = new Column("none", "end");
const r1 = new Row("square", "end");
r1.add(new Text("Hello", cl.cyan, cl.yellow));
r1.add(new Text(" World", cl.cyan, cl.yellow));
c.add(r1);
const r2 = new Row();
r2.add(new Text("Le", cl.red, cl.blue));
r2.add(new Text("Tui", cl.grey, cl.magenta));
c.add(r2);
v.add(c);
v.render();
