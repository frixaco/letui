/**
 * FFF-backed search for workspace files and dynamic application records.
 * Files -> workspace FFF index; candidates -> temporary files -> catalog FFF index -> ranked values
 */

import { FileFinder } from "@ff-labs/fff-node";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class SearchIndex {
  constructor(rootPath: string) {
    this.catalogRoot = mkdtempSync(join(tmpdir(), "letui-agent-search-"));
    const files = createFinder(rootPath, false);
    this.fileFinder = files.finder;
    this.error = files.error;
  }

  readonly error: string | null;

  async ready(): Promise<void> {
    await waitForFinder(this.fileFinder);
  }

  searchPaths(query: string, limit: number): SearchPath[] {
    if (!this.fileFinder) return [];
    const result = this.fileFinder.mixedSearch(query, { maxThreads: 1, pageSize: limit });
    return result.ok
      ? result.value.items.map((entry) => ({
          path: entry.item.relativePath.replace(/\/$/, ""),
          kind: entry.type,
        }))
      : [];
  }

  index<T>(scope: string, candidates: readonly SearchCandidate<T>[]): Promise<void> {
    const task = this.updateQueue.then(async () => {
      const signature = candidates.map((candidate) => candidate.text).join("\0");
      const current = this.scopes.get(scope);
      if (current?.signature === signature) {
        current.byPath.clear();
        for (const [index, candidate] of candidates.entries())
          current.byPath.set(candidateFilename(candidate.text, index), candidate.value);
        current.candidates = normalizedCandidates(candidates);
        return;
      }
      const scopePath = join(this.catalogRoot, scope);
      current?.finder?.destroy();
      rmSync(scopePath, { recursive: true, force: true });
      mkdirSync(scopePath, { recursive: true });

      const byPath = new Map<string, unknown>();
      let nextIndex = 0;
      await Promise.all(
        Array.from({ length: Math.min(32, candidates.length) }, async () => {
          while (nextIndex < candidates.length) {
            const index = nextIndex++;
            const candidate = candidates[index]!;
            const filename = candidateFilename(candidate.text, index);
            await Bun.write(join(scopePath, filename), "");
            byPath.set(filename, candidate.value);
          }
        }),
      );
      const catalog = createFinder(scopePath, true);
      await waitForFinder(catalog.finder);
      this.scopes.set(scope, {
        byPath,
        finder: catalog.finder,
        signature,
        candidates: normalizedCandidates(candidates),
      });
    });
    this.updateQueue = task.catch(() => {});
    return task;
  }

  clear(scope: string): Promise<void> {
    const task = this.updateQueue.then(() => {
      this.scopes.get(scope)?.finder?.destroy();
      this.scopes.delete(scope);
      rmSync(join(this.catalogRoot, scope), { recursive: true, force: true });
    });
    this.updateQueue = task.catch(() => {});
    return task;
  }

  search<T>(scope: string, query: string, limit: number): T[] {
    const state = this.scopes.get(scope);
    if (!state) return [];
    if (!query) return state.candidates.slice(0, limit).map((candidate) => candidate.value as T);
    if (!state.finder) return fallbackSearch<T>(state, query, limit);

    const result = state.finder.fileSearch(query, {
      maxThreads: 1,
      pageSize: limit,
    });
    if (!result.ok) return fallbackSearch<T>(state, query, limit);
    const matches: T[] = [];
    for (const item of result.value.items) {
      const value = state.byPath.get(item.relativePath);
      if (value === undefined) continue;
      matches.push(value as T);
      if (matches.length === limit) break;
    }
    return matches;
  }

  destroy(): void {
    this.fileFinder?.destroy();
    for (const scope of this.scopes.values()) scope.finder?.destroy();
    rmSync(this.catalogRoot, { recursive: true, force: true });
  }

  private readonly fileFinder: FileFinder | null;
  private readonly catalogRoot: string;
  private readonly scopes = new Map<string, SearchScope>();
  private updateQueue: Promise<void> = Promise.resolve();
}

export type SearchCandidate<T> = {
  value: T;
  text: string;
};

export type SearchPath = {
  path: string;
  kind: "file" | "directory";
};

type SearchScope = {
  byPath: Map<string, unknown>;
  finder: FileFinder | null;
  signature: string;
  candidates: ReadonlyArray<{ value: unknown; text: string }>;
};

function normalizedCandidates<T>(
  candidates: readonly SearchCandidate<T>[],
): ReadonlyArray<{ value: unknown; text: string }> {
  return candidates.map((candidate) => ({
    value: candidate.value,
    text: candidate.text.toLowerCase(),
  }));
}

function createFinder(
  basePath: string,
  catalog: boolean,
): { finder: FileFinder | null; error: string | null } {
  const result = FileFinder.create({
    basePath,
    disableContentIndexing: true,
    disableMmapCache: true,
    disableWatch: catalog,
  });
  return result.ok
    ? { finder: result.value, error: null }
    : { finder: null, error: `FFF ${catalog ? "catalog" : "file"} index: ${result.error}` };
}

async function waitForFinder(finder: FileFinder | null): Promise<void> {
  if (finder) await finder.waitForScan(5_000);
}

function candidateFilename(text: string, index: number): string {
  const normalized = text
    .replaceAll("\0", " ")
    .replaceAll(/[\\/\r\n]+/g, " ")
    .replaceAll(/[^\p{L}\p{N}._ -]+/gu, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
  const suffix = ` --${index}.item`;
  return `${truncateUtf8(normalized || "item", 220 - Buffer.byteLength(suffix))}${suffix}`;
}

function truncateUtf8(value: string, maxBytes: number): string {
  let bytes = 0;
  let result = "";
  for (const character of value) {
    const nextBytes = Buffer.byteLength(character);
    if (bytes + nextBytes > maxBytes) break;
    result += character;
    bytes += nextBytes;
  }
  return result;
}

function fallbackSearch<T>(state: SearchScope, query: string, limit: number): T[] {
  const normalized = query.toLowerCase();
  return state.candidates
    .map((candidate) => ({ candidate, score: fuzzyScore(candidate.text, normalized) }))
    .filter((entry) => entry.score >= 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.candidate.value as T);
}

function fuzzyScore(value: string, query: string): number {
  let queryIndex = 0;
  let score = 0;
  let previousMatch = -2;
  for (let index = 0; index < value.length && queryIndex < query.length; index++) {
    if (value[index] !== query[queryIndex]) continue;
    score += index === previousMatch + 1 ? 4 : 1;
    if (index === 0 || /[\s._-]/.test(value[index - 1]!)) score += 3;
    previousMatch = index;
    queryIndex++;
  }
  return queryIndex === query.length ? score - value.length * 0.001 : -1;
}
