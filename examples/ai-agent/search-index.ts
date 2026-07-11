/**
 * FFF-backed search for workspace files and dynamic application records.
 * Files -> workspace FFF index; candidates -> temporary files -> catalog FFF index -> ranked values
 */

import { FileFinder } from "@ff-labs/fff-node";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export class SearchIndex {
  constructor(rootPath: string) {
    this.catalogRoot = mkdtempSync(join(tmpdir(), "letui-agent-search-"));
    const files = createFinder(rootPath, false);
    const catalog = createFinder(this.catalogRoot, true);
    this.fileFinder = files.finder;
    this.catalogFinder = catalog.finder;
    this.error = [files.error, catalog.error].filter(Boolean).join("; ") || null;
  }

  readonly error: string | null;

  async ready(): Promise<void> {
    await Promise.all([waitForFinder(this.fileFinder), waitForFinder(this.catalogFinder)]);
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
      await waitForFinder(this.catalogFinder);
      const scopePath = join(this.catalogRoot, scope);
      rmSync(scopePath, { recursive: true, force: true });
      mkdirSync(scopePath, { recursive: true });

      const byPath = new Map<string, unknown>();
      for (const [index, candidate] of candidates.entries()) {
        const filename = candidateFilename(candidate.text, index);
        const relativePath = `${scope}/${filename}`;
        writeFileSync(join(this.catalogRoot, relativePath), "");
        byPath.set(relativePath, candidate.value);
      }
      this.scopes.set(scope, {
        byPath,
        candidates: candidates.map((candidate) => ({
          value: candidate.value,
          text: candidate.text.toLowerCase(),
        })),
      });

      const scan = this.catalogFinder?.scanFiles();
      if (scan?.ok) await waitForFinder(this.catalogFinder);
    });
    this.updateQueue = task.catch(() => {});
    return task;
  }

  clear(scope: string): Promise<void> {
    const task = this.updateQueue.then(() => {
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
    if (!this.catalogFinder) return fallbackSearch<T>(state, query, limit);

    const result = this.catalogFinder.fileSearch(query, {
      maxThreads: 1,
      pageSize: Math.max(limit, this.totalCandidates()),
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
    this.catalogFinder?.destroy();
    rmSync(this.catalogRoot, { recursive: true, force: true });
  }

  private readonly fileFinder: FileFinder | null;
  private readonly catalogFinder: FileFinder | null;
  private readonly catalogRoot: string;
  private readonly scopes = new Map<string, SearchScope>();
  private updateQueue: Promise<void> = Promise.resolve();

  private totalCandidates(): number {
    let total = 0;
    for (const scope of this.scopes.values()) total += scope.candidates.length;
    return total;
  }
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
  candidates: ReadonlyArray<{ value: unknown; text: string }>;
};

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
  const characters = Array.from(value);
  while (Buffer.byteLength(characters.join("")) > maxBytes) characters.pop();
  return characters.join("");
}

function fallbackSearch<T>(state: SearchScope, query: string, limit: number): T[] {
  const normalized = query.toLowerCase();
  return state.candidates
    .filter((candidate) => candidate.text.includes(normalized))
    .slice(0, limit)
    .map((candidate) => candidate.value as T);
}
