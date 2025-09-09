// index.ts
import {
	dlopen,
	FFIType,
	ptr,
	suffix,
	toArrayBuffer,
	type Pointer,
} from "bun:ffi";

// Path to Rust .so/.dylib
const libPath = `./letui-ffi/target/release/libletui_ffi.${suffix}`;

const { symbols } = dlopen(libPath, {
	init_buffer: { args: [FFIType.u64], returns: FFIType.i32 },
	get_buffer: {
		args: [FFIType.pointer, FFIType.pointer],
		returns: FFIType.i32,
	},
	free_buffer: { returns: FFIType.i32 },
});

symbols.init_buffer(10);

// Create buffers to store the pointer and length values
const ptrBuffer = new ArrayBuffer(8); // 8 bytes for pointer
const lenBuffer = new ArrayBuffer(8); // 8 bytes for length

// Call get_buffer(&ptr, &len) - pass pointers to our buffers
const result = symbols.get_buffer(ptr(ptrBuffer), ptr(lenBuffer));

if (result === 1) {
	// Successfully got buffer info
	const bufferPtr = new BigUint64Array(ptrBuffer)[0];
	const bufferLen = Number(new BigUint64Array(lenBuffer)[0]);

	console.log("Buffer pointer:", bufferPtr);
	console.log("Buffer length:", bufferLen);

	// Create ArrayBuffer from the Rust buffer pointer
	// Each element is u64 (8 bytes), so total bytes = len * 8
	const arrayBuffer = toArrayBuffer(
		Number(bufferPtr) as Pointer,
		0,
		bufferLen * 8,
	);
	const view = new BigUint64Array(arrayBuffer);

	console.log("Initial contents:", view);

	// Write something from JS
	view[0] = 42n;
	view[1] = 1337n;
	view[2] = 9999n;

	console.log("JS wrote to Rust buffer!");
	console.log("Updated contents:", view);
} else {
	console.error("Failed to get buffer");
}

// Clean up
symbols.free_buffer();
