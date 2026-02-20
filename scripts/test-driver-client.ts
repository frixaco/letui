const [socketPath, commandJson] = Bun.argv.slice(2);

if (!socketPath || !commandJson) {
  console.error(
    'Usage: bun scripts/test-driver-client.ts <socket-path> \'{"cmd":"ping"}\'',
  );
  process.exit(1);
}

try {
  JSON.parse(commandJson);
} catch {
  console.error("Second argument must be valid JSON");
  process.exit(1);
}

type DriverSocketData = { pending: string };

await new Promise<void>((resolve, reject) => {
  Bun.connect<DriverSocketData>({
    unix: socketPath,
    data: { pending: "" },
    socket: {
      open(socket) {
        socket.write(`${commandJson}\n`);
      },
      data(socket, chunk) {
        socket.data.pending += chunk.toString();
        const newline = socket.data.pending.indexOf("\n");
        if (newline === -1) return;

        const line = socket.data.pending.slice(0, newline);
        console.log(line);
        socket.end();
        resolve();
      },
      connectError(_socket, error) {
        reject(error);
      },
      error(_socket, error) {
        reject(error);
      },
    },
  }).catch(reject);
});

export {};
