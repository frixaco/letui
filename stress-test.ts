const args = Bun.argv.slice(2);
const width = parseInt(args[0], 10) || 32;
const height = parseInt(args[1], 10) || 32;
const iterations = parseInt(args[2], 10) || 1000;

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+";

const randomInt = (max: number) => Math.floor(Math.random() * max);

console.log(`Running test: ${width}x${height} characters for ${iterations} frames...`);

const start = Bun.nanoseconds();

for (let i = 0; i < iterations; i++) {
  let buffer = "\x1b[H";

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = randomInt(256);
      const char = chars[randomInt(chars.length)];
      buffer += `\x1b[38;5;${color}m${char}`;
    }
    buffer += "\x1b[0m\n";
  }

  Bun.write(Bun.stdout, buffer);
}

const totalTimeMs = (Bun.nanoseconds() - start) / 1e6;

console.log("\n");
console.log(`Done!`);
console.log(`Total Time: ${totalTimeMs.toFixed(2)} ms`);
console.log(`Average per frame: ${(totalTimeMs / iterations).toFixed(4)} ms`);
