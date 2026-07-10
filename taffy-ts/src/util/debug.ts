export class DebugLogger {
    stack: string[] = [];
    enabled: boolean = false;
    writer: (line: string) => void;
    now: () => number;

    constructor(writer: (line: string) => void = (line: string) => console.log(line), now: () => number = () => performance.now()) {
        this.writer = writer;
        this.now = now;
    }

    enable(): void {
        this.enabled = true;
    }

    disable(): void {
        this.enabled = false;
    }

    clear(): void {
        this.stack.length = 0;
    }

    pushNode(newKey: unknown): void {
        if (!this.enabled)
            return;
        this.stack.push(String(newKey));
    }

    push_node(newKey: unknown): void {
        this.pushNode(newKey);
    }

    popNode(): void {
        if (!this.enabled)
            return;
        this.stack.pop();
    }

    pop_node(): void {
        this.popNode();
    }

    log(message: unknown = ""): void {
        if (!this.enabled)
            return;
        this.write(String(message));
    }

    labelledLog(label: unknown, message: unknown): void {
        if (!this.enabled)
            return;
        this.write(`${label} ${String(message)}`);
    }

    labelled_log(label: unknown, message: unknown): void {
        this.labelledLog(label, message);
    }

    debugLog(message: unknown): void {
        if (!this.enabled)
            return;
        this.write(formatDebugValue(message));
    }

    debug_log(message: unknown): void {
        this.debugLog(message);
    }

    labelledDebugLog(label: unknown, message: unknown): void {
        if (!this.enabled)
            return;
        this.write(`${label} ${formatDebugValue(message)}`);
    }

    labelled_debug_log(label: unknown, message: unknown): void {
        this.labelledDebugLog(label, message);
    }

    time<T>(label: unknown, callback: () => T): T {
        if (!this.enabled)
            return callback();

        const start = this.now();
        const result = callback();
        const elapsed = this.now() - start;
        this.log(`Performed ${label} in ${Math.trunc(elapsed)}ms`);
        return result;
    }

    write(message: string): void {
        const key = this.stack[this.stack.length - 1] ?? "";
        const indent = " ".repeat(this.stack.length * 4);
        this.writer(`${indent}${key}: ${message}`);
    }
}

export const NODE_LOGGER = new DebugLogger();

export function debugPushNode(nodeId: unknown, logger: DebugLogger = NODE_LOGGER): void {
    logger.pushNode(nodeId);
    logger.log("");
}

export function debug_push_node(nodeId: unknown, logger: DebugLogger = NODE_LOGGER): void {
    debugPushNode(nodeId, logger);
}

export function debugPopNode(logger: DebugLogger = NODE_LOGGER): void {
    logger.popNode();
}

export function debug_pop_node(logger: DebugLogger = NODE_LOGGER): void {
    debugPopNode(logger);
}

export function debugLog(...args: unknown[]): void {
    const maybeLogger = args[args.length - 1];
    const logger = maybeLogger instanceof DebugLogger ? (args.pop() as DebugLogger) : NODE_LOGGER;
    if (args.length === 0) {
        logger.log("");
    }
    else if (args.length === 1) {
        logger.log(args[0]);
    }
    else {
        logger.labelledLog(args[0], args[1]);
    }
}

export function debug_log(...args: unknown[]): void {
    debugLog(...args);
}

export function time<T>(label: unknown, callback: () => T, logger: DebugLogger = NODE_LOGGER): T {
    return logger.time(label, callback);
}

function formatDebugValue(value: unknown): string {
    if (typeof value === "string")
        return value;
    return Bun.inspect(value);
}
