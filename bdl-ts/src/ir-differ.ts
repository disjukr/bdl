import type * as ir from "./generated/ir.ts";
import type * as irDiff from "./generated/ir-diff.ts";

export function diffBdlIr(_prev: ir.BdlIr, _next: ir.BdlIr): irDiff.BdlIrDiff {
  return { modules: [], defs: [] }; // TODO
}

type Diff<T> = ["keep", T, T] | ["add", T] | ["remove", T] | ["replace", T, T];

function diffSet<T>(prev: Set<T>, next: Set<T>): Diff<T>[] {
  const result: Diff<T>[] = [];
  result.push(
    ...prev.difference(next).values().map(
      (item) => ["remove", item] as Diff<T>,
    ),
  );
  for (const item of next) {
    if (prev.has(item)) result.push(["keep", item, item]);
    else result.push(["add", item]);
  }
  return result;
}
Deno.test("diffSet", async () => {
  const { assertEquals } = await import("jsr:@std/assert");
  assertEquals(
    diffSet(new Set([1, 2, 3, 4]), new Set([2, 3, 5])),
    [["remove", 1], ["remove", 4], ["keep", 2, 2], ["keep", 3, 3], ["add", 5]],
  );
});

function diffArray<T>(prev: T[], next: T[], eq = refEq): Diff<T>[] {
  const result: Diff<T>[] = [];
  const t = levenshtein(prev, next, eq);
  let i = prev.length, j = next.length;
  while ((i > 0) || (j > 0)) {
    const prevItem = prev[i - 1];
    const nextItem = next[j - 1];
    if ((i > 0) && (j > 0) && eq(prevItem, nextItem)) {
      result.push(["keep", prevItem, nextItem]);
      --i;
      --j;
    } else if ((j > 0) && ((i === 0) || (t[i][j] === t[i][j - 1] + 1))) {
      result.push(["add", nextItem]);
      --j;
    } else if ((i > 0) && ((j === 0) || (t[i][j] === t[i - 1][j] + 1))) {
      result.push(["remove", prevItem]);
      --i;
    } else {
      result.push(["replace", prevItem, nextItem]);
      --i;
      --j;
    }
  }
  return result.reverse();
}
Deno.test("diffArray", async () => {
  const { assertEquals } = await import("jsr:@std/assert");
  assertEquals(
    diffArray([1, 2, 3, 4], [2, 3, 5]),
    [["remove", 1], ["keep", 2, 2], ["keep", 3, 3], ["replace", 4, 5]],
  );
});

type Levenshtein = number[][];
function levenshtein<T>(prev: T[], next: T[], eq = refEq): Levenshtein {
  const height = prev.length + 1;
  const width = next.length + 1;
  const result = Array(height).fill(0).map(() => Array(width).fill(0));
  for (let i = 0; i < height; ++i) result[i][0] = i;
  for (let j = 0; j < width; ++j) result[0][j] = j;
  for (let i = 1; i < height; ++i) {
    for (let j = 1; j < width; ++j) {
      const prevItem = prev[i - 1];
      const nextItem = next[j - 1];
      result[i][j] = Math.min(
        result[i - 1][j] + 1,
        result[i][j - 1] + 1,
        result[i][j] + (eq(prevItem, nextItem) ? 0 : 1),
      );
    }
  }
  return result;
}
Deno.test("levenshtein", async () => {
  const { assertEquals } = await import("jsr:@std/assert");
  assertEquals(
    levenshtein([1, 2, 3, 4], [2, 3, 5]),
    [[0, 1, 2, 3], [1, 1, 1, 1], [2, 0, 1, 1], [3, 1, 0, 1], [4, 1, 1, 1]],
  );
});

function refEq<T>(prev: T, next: T): boolean {
  return prev === next;
}
