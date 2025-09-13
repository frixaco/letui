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

const path = `./letui-ffi/target/release/libletui_ffi.${suffix}`;

const {
	symbols: {
		init_buffer,
		get_buffer,
		get_size,
		free_buffer,
		debug_buffer,
		init_letui,
		deinit_letui,
		render,
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
	get_buffer: {
		args: [FFIType.pointer, FFIType.pointer],
		returns: FFIType.i32,
	},
	get_size: {
		args: [FFIType.pointer, FFIType.pointer],
		returns: FFIType.i32,
	},
	free_buffer: {
		args: [],
		returns: FFIType.i32,
	},
	debug_buffer: {
		args: [FFIType.u64],
		returns: FFIType.u64,
	},
	render: {
		args: [],
		returns: FFIType.i32,
	},
});

console.log(`INIT BUFFER: ${init_buffer()}`);
const outPtr = new BigUint64Array(1);
const outLen = new BigUint64Array(1);
console.log(`GET BUFFER: ${get_buffer(ptr(outPtr), ptr(outLen))}`);
const bufPtr = Number(outPtr[0]);
const bufLen = Number(outLen[0]);
console.log(bufPtr, bufLen);

const buffer = new BigUint64Array(
	toArrayBuffer(bufPtr as Pointer, 0, bufLen * 8),
);
console.log(buffer[0]);
buffer[0] = 12n;
console.log(buffer[0]);
console.log(debug_buffer(0));

const wp = new Uint16Array(1);
const hp = new Uint16Array(1);
get_size(ptr(wp), ptr(hp));
const width = Number(wp[0]);
const height = Number(hp[0]);
console.log("size:", width, height);

init_letui();
process.stdin.resume();
process.stdin.on("data", (data) => {
	if (data.toString() === "q") {
		deinit_letui();
		free_buffer();
		process.exit(0);
	} else {
	}
});

class Container {}
class Content {}

class View extends Container {
	child(item: Container | Content) {}
}

class Row extends Container {
	child(item: Content) {}
}

class Text extends Content {}

const v = new View();
const r = new Row();
const t1 = new Text();
const t2 = new Text();
r.child(t1);
r.child(t2);
v.child(r);

// const show_text = (
// 	text: string,
// 	fg: number,
// 	bg: number,
// 	// border: boolean = false,
// ) => {
// 	let cells = [];
// 	for (let c of text) {
// 		cells.push(BigInt(c.codePointAt(0)!), BigInt(fg), BigInt(bg));
// 	}
// 	buffer.set(cells, cursor);
// 	cursor = text.length * 3;
// };
// show_text("HELLO", cl.yellow, cl.grey);
// show_text("WORLD", cl.purple, cl.bg_highlight);

render();
