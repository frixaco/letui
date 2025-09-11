import {
	dlopen,
	FFIType,
	ptr,
	suffix,
	toArrayBuffer,
	type Pointer,
} from "bun:ffi";

const path = `./letui-ffi/target/release/libletui_ffi.${suffix}`;

const {
	symbols: {
		init_buffer,
		get_buffer,
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

buffer[0] = BigInt("H".codePointAt(0)!);
buffer[1] = BigInt(0x00ffff);
buffer[2] = BigInt(0x12a61f);

buffer[3] = BigInt("W".codePointAt(0)!);
buffer[4] = BigInt(0x1e1e8e);
buffer[5] = BigInt(0xf0ff0f);

render();
