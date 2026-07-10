import {
  AlignContent,
  AvailableSpace,
  Dimension,
  Display,
  FlexDirection,
  GridAutoFlow,
  LengthPercentage,
  Size,
  Style,
  TaffyTree,
  lengthTrack,
  repeat,
} from "../src/index.js";

const ITERATIONS = Number(Bun.env.TAFFY_TS_BENCH_ITERS ?? 20_000);
const WARMUP_ITERATIONS = Number(Bun.env.TAFFY_TS_BENCH_WARMUP_ITERS ?? 1_000);
const WIDTH = 120;
const HEIGHT = 40;

type BenchmarkTree = {
  taffy: TaffyTree;
  root: any;
  dirtyNode?: any;
};
type DirtyTarget = "root" | "dirtyNode" | "none";
type CalcBenchmarkHandle = { fraction: number; offset: number };

type BenchmarkScenario = {
  name: string;
  createTree: () => BenchmarkTree;
  defaultMaxAverageMs: number;
  dirtyTarget?: DirtyTarget;
};

type BenchmarkResult = {
  name: string;
  iterations: number;
  maxAverageMs: number;
  totalMs: number;
  averageMs: number;
  layoutsPerSecond: number;
};

const SCENARIOS: BenchmarkScenario[] = [
  {
    name: "flex-stress",
    createTree: createFlexStressTree,
    defaultMaxAverageMs: 0.2,
  },
  {
    name: "flex-hot-cache",
    createTree: createFlexStressTree,
    defaultMaxAverageMs: 0.05,
    dirtyTarget: "none",
  },
  {
    name: "flex-leaf-dirty",
    createTree: createFlexStressTree,
    defaultMaxAverageMs: 0.1,
    dirtyTarget: "dirtyNode",
  },
  {
    name: "flex-calc-stress",
    createTree: createFlexCalcStressTree,
    defaultMaxAverageMs: 0.25,
  },
  {
    name: "grid-stress",
    createTree: createGridStressTree,
    defaultMaxAverageMs: 0.3,
  },
  {
    name: "grid-leaf-dirty",
    createTree: createGridStressTree,
    defaultMaxAverageMs: 0.2,
    dirtyTarget: "dirtyNode",
  },
  {
    name: "block-stress",
    createTree: createBlockStressTree,
    defaultMaxAverageMs: 0.2,
  },
  {
    name: "block-leaf-dirty",
    createTree: createBlockStressTree,
    defaultMaxAverageMs: 0.1,
    dirtyTarget: "dirtyNode",
  },
];

class CalcBenchmarkTree extends TaffyTree {
  override resolveCalcValue(value: unknown, basis: number): number {
    const handle = value as CalcBenchmarkHandle;
    return basis * handle.fraction + handle.offset;
  }
}

function createFlexStressTree(useCalc = false) {
  const taffy = useCalc ? new CalcBenchmarkTree() : TaffyTree.new();
  const rows = [];
  let dirtyNode;

  for (let rowIndex = 0; rowIndex < 20; rowIndex += 1) {
    const cells = [];

    for (let cellIndex = 0; cellIndex < 8; cellIndex += 1) {
      const cell = taffy.newLeaf(
        new Style({
          flexGrow: cellIndex % 3 === 0 ? 1 : 0,
          flexShrink: 1,
          size: new Size(
            useCalc
              ? Dimension.calc({ fraction: 0.05, offset: cellIndex })
              : Dimension.length(6 + cellIndex),
            Dimension.length(1),
          ),
        }),
      );
      dirtyNode ??= cell;
      cells.push(cell);
    }

    rows.push(
      taffy.newWithChildren(
        new Style({
          flexDirection: FlexDirection.Row,
          gap: new Size(
            useCalc
              ? LengthPercentage.calc({ fraction: 0, offset: 1 })
              : LengthPercentage.length(1),
            LengthPercentage.zero(),
          ),
          size: new Size(Dimension.auto(), Dimension.length(1)),
        }),
        cells,
      ),
    );
  }

  const root = taffy.newWithChildren(
    new Style({
      flexDirection: FlexDirection.Column,
      justifyContent: AlignContent.FlexStart,
      gap: new Size(LengthPercentage.zero(), LengthPercentage.length(1)),
      size: new Size(Dimension.length(WIDTH), Dimension.length(HEIGHT)),
    }),
    rows,
  );

  return { taffy, root, dirtyNode };
}

function createFlexCalcStressTree() {
  return createFlexStressTree(true);
}

function createGridStressTree() {
  const taffy = TaffyTree.new();
  const children = [];

  for (let index = 0; index < 100; index += 1) {
    children.push(
      taffy.newLeaf(
        new Style({
          size: new Size(Dimension.auto(), Dimension.auto()),
        }),
      ),
    );
  }

  const root = taffy.newWithChildren(
    new Style({
      display: Display.Grid,
      size: new Size(Dimension.length(WIDTH), Dimension.length(HEIGHT)),
      gap: new Size(LengthPercentage.length(1), LengthPercentage.length(1)),
      gridAutoFlow: GridAutoFlow.Row,
      gridTemplateRows: [repeat(10, [lengthTrack(3)])],
      gridTemplateColumns: [repeat(10, [lengthTrack(11)])],
    }),
    children,
  );

  return { taffy, root, dirtyNode: children[0] };
}

function createBlockStressTree() {
  const taffy = TaffyTree.new();
  const children = [];

  for (let index = 0; index < 80; index += 1) {
    children.push(
      taffy.newLeaf(
        new Style({
          display: Display.Block,
          size: new Size(Dimension.auto(), Dimension.length(1 + (index % 3))),
        }),
      ),
    );
  }

  const root = taffy.newWithChildren(
    new Style({
      display: Display.Block,
      size: new Size(Dimension.length(WIDTH), Dimension.auto()),
      gap: new Size(LengthPercentage.zero(), LengthPercentage.length(1)),
    }),
    children,
  );

  return { taffy, root, dirtyNode: children[0] };
}

function runScenario({
  name,
  createTree,
  defaultMaxAverageMs,
  dirtyTarget = "root",
}: BenchmarkScenario): BenchmarkResult {
  const { taffy, root, dirtyNode } = createTree();
  const available = new Size(AvailableSpace.definite(WIDTH), AvailableSpace.definite(HEIGHT));
  const target = dirtyTarget === "dirtyNode" ? dirtyNode : root;
  if (dirtyTarget === "dirtyNode" && target === undefined) {
    throw new Error(`${name} requested a dirty node but its tree did not provide one`);
  }

  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    if (dirtyTarget !== "none") {
      taffy.markDirty(target);
    }
    taffy.computeLayout(root, available);
  }

  const started = performance.now();
  for (let i = 0; i < ITERATIONS; i += 1) {
    if (dirtyTarget !== "none") {
      taffy.markDirty(target);
    }
    taffy.computeLayout(root, available);
  }
  const elapsed = performance.now() - started;
  const averageMs = elapsed / ITERATIONS;

  return {
    name,
    iterations: ITERATIONS,
    maxAverageMs: scenarioMaxAverageMs(name, defaultMaxAverageMs),
    totalMs: Number(elapsed.toFixed(3)),
    averageMs: Number(averageMs.toFixed(6)),
    layoutsPerSecond: Math.round(1000 / averageMs),
  };
}

function main() {
  const scenarios = SCENARIOS.map(runScenario);

  console.log(JSON.stringify({ iterations: ITERATIONS, scenarios }, null, 2));

  for (const scenario of scenarios) {
    if (scenario.averageMs > scenario.maxAverageMs) {
      throw new Error(
        `${scenario.name} average layout time ${scenario.averageMs.toFixed(3)}ms exceeds ${scenario.maxAverageMs}ms budget`,
      );
    }
  }
}

function scenarioMaxAverageMs(name: string, defaultValue: number): number {
  const scenarioEnvName = `TAFFY_TS_BENCH_${name.toUpperCase().replaceAll("-", "_")}_MAX_AVG_MS`;
  return Number(Bun.env[scenarioEnvName] ?? Bun.env.TAFFY_TS_BENCH_MAX_AVG_MS ?? defaultValue);
}

main();
