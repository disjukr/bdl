import type * as ir from "./generated/ir.ts";
import type * as irDiff from "./generated/ir-diff.ts";
import type * as irRef from "./generated/ir-ref.ts";

export function diffBdlIr(_prev: ir.BdlIr, _next: ir.BdlIr): irDiff.BdlIrDiff {
  return { modules: [], defs: [] }; // TODO
}

function diffAttributes(
  prev: Record<string, string>,
  next: Record<string, string>,
  toIrRef: (ref: irRef.Attribute, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffRecordKeys(prev, next),
    itemToRef: (key, isPrev) =>
      toIrRef({ type: "Attribute", key, ref: { type: "This" } }, isPrev),
    nested: {
      getTarget: (key, isPrev) => (isPrev ? prev : next)[key],
      diffFn: ({ prevItem, prevTarget, nextItem, nextTarget }) =>
        convertDiffs({
          diffs: diffPrimitive(prevTarget, nextTarget),
          itemToRef: (_value, isPrev) =>
            toIrRef({
              type: "Attribute",
              key: isPrev ? prevItem : nextItem,
              ref: { type: "Value" },
            }, isPrev),
        }),
    },
  });
}

interface ConvertDiffsConfig<TItem, TTarget> {
  diffs: Diff<TItem>[];
  itemToRef: (item: TItem, isPrev: boolean) => irRef.BdlIrRef;
  nested?: {
    getTarget: (item: TItem, isPrev: boolean) => TTarget;
    diffFn: (config: {
      prevItem: TItem;
      prevTarget: TTarget;
      nextItem: TItem;
      nextTarget: TTarget;
    }) => irDiff.DiffItem[];
  };
}
function convertDiffs<T, U>(
  config: ConvertDiffsConfig<T, U>,
): irDiff.DiffItem[] {
  return config.diffs.map((diff) => {
    switch (diff[0]) {
      case "keep": {
        const prev = diff[1];
        const prevRef = config.itemToRef(prev, true);
        if (!config.nested) return { type: "Keep", prevRef };
        const next = diff[2];
        const nextRef = config.itemToRef(next, false);
        const items = config.nested.diffFn({
          prevItem: prev,
          prevTarget: config.nested.getTarget(prev, true),
          nextItem: next,
          nextTarget: config.nested.getTarget(next, false),
        });
        return { type: "Modify", prevRef, nextRef, items };
      }
      case "add": {
        const nextRef = config.itemToRef(diff[1], false);
        return { type: "Add", nextRef };
      }
      case "remove": {
        const prevRef = config.itemToRef(diff[1], true);
        return { type: "Remove", prevRef };
      }
      case "replace": {
        const prevRef = config.itemToRef(diff[1], true);
        const nextRef = config.itemToRef(diff[2], false);
        return { type: "Replace", prevRef, nextRef };
      }
    }
  });
}

function diffRecordKeys(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Diff<string>[] {
  return diffSet(new Set(Object.keys(prev)), new Set(Object.keys(next)));
}

type Diff<T> = ["keep", T, T] | ["add", T] | ["remove", T] | ["replace", T, T];

function diffPrimitive<T>(
  prev: T | undefined,
  next: T | undefined,
): Diff<T>[] {
  if (prev == null && next != null) return [["add", next]];
  if (prev != null && next == null) return [["remove", prev]];
  if (prev != null && next != null) {
    if (prev === next) return [["keep", prev, next]];
    return [["replace", prev, next]];
  }
  return [];
}

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

function diffArray<T>(
  prev: T[],
  next: T[],
  eq: (prev: T, next: T) => boolean = refEq,
): Diff<T>[] {
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
function levenshtein<T>(
  prev: T[],
  next: T[],
  eq: (prev: T, next: T) => boolean = refEq,
): Levenshtein {
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
