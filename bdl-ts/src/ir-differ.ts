import type * as ir from "./generated/ir.ts";
import type * as irDiff from "./generated/ir-diff.ts";
import type * as irRef from "./generated/ir-ref.ts";

export function diffBdlIr(_prev: ir.BdlIr, _next: ir.BdlIr): irDiff.BdlIrDiff {
  return { modules: [], defs: [] }; // TODO
}

function diffImportItems(
  prev: ir.ImportItem[],
  next: ir.ImportItem[],
  refToIrRef: (ref: irRef.ImportItem, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffArray(prev, next, (p, n) => p.name === n.name),
    refToIrRef,
    itemToRef: (item, isPrev): irRef.ImportItem => {
      const index = (isPrev ? prev : next).indexOf(item);
      return ({ type: "ImportItem", index, ref: { type: "This" } });
    },
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffImportItem(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffImportItem(
  prev: ir.ImportItem,
  next: ir.ImportItem,
  refToIrRef: (ref: irRef.ImportItemRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffPrimitive(prev.as, next.as),
    refToIrRef,
    itemToRef: (): irRef.ImportItemRef => ({ type: "As" }),
  });
}

function diffAttributes(
  prev: Record<string, string>,
  next: Record<string, string>,
  refToIrRef: (ref: irRef.Attribute, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffRecordKeys(prev, next),
    refToIrRef,
    itemToRef: (key): irRef.Attribute => ({
      type: "Attribute",
      key,
      ref: { type: "This" },
    }),
    nested: {
      getTarget: (key, isPrev) => (isPrev ? prev : next)[key],
      diffFn: ({ prevItem, prevTarget, nextItem, nextTarget }) =>
        convertDiffs({
          diffs: diffPrimitive(prevTarget, nextTarget),
          refToIrRef,
          itemToRef: (_value, isPrev): irRef.Attribute => ({
            type: "Attribute",
            key: isPrev ? prevItem : nextItem,
            ref: { type: "Value" },
          }),
        }),
    },
  });
}

interface ConvertDiffsConfig<TItem, TTarget, TRef> {
  diffs: Diff<TItem>[];
  refToIrRef: (ref: TRef, isPrev: boolean) => irRef.BdlIrRef;
  itemToRef: (item: TItem, isPrev: boolean) => TRef;
  nested?: {
    getTarget: (item: TItem, isPrev: boolean) => TTarget;
    diffFn: (config: {
      prevRef: TRef;
      prevItem: TItem;
      prevTarget: TTarget;
      nextRef: TRef;
      nextItem: TItem;
      nextTarget: TTarget;
    }) => irDiff.DiffItem[];
  };
}
function convertDiffs<T, U, V>(
  config: ConvertDiffsConfig<T, U, V>,
): irDiff.DiffItem[] {
  const itemToIrRef = (item: T, isPrev: boolean) =>
    config.refToIrRef(config.itemToRef(item, isPrev), isPrev);
  return config.diffs.map((diff) => {
    switch (diff[0]) {
      case "keep": {
        const prevItem = diff[1];
        const prevRef = config.itemToRef(prevItem, true);
        const _prevRef = config.refToIrRef(prevRef, true);
        if (!config.nested) return { type: "Keep", prevRef: _prevRef };
        const prevTarget = config.nested.getTarget(prevItem, true);
        const nextItem = diff[2];
        const nextTarget = config.nested.getTarget(nextItem, false);
        const nextRef = config.itemToRef(nextItem, false);
        const _nextRef = config.refToIrRef(nextRef, false);
        const items = config.nested.diffFn({
          prevRef,
          prevItem,
          prevTarget,
          nextRef,
          nextItem,
          nextTarget,
        });
        return { type: "Modify", prevRef: _prevRef, nextRef: _nextRef, items };
      }
      case "add": {
        const nextRef = itemToIrRef(diff[1], false);
        return { type: "Add", nextRef };
      }
      case "remove": {
        const prevRef = itemToIrRef(diff[1], true);
        return { type: "Remove", prevRef };
      }
      case "replace": {
        const prevRef = itemToIrRef(diff[1], true);
        const nextRef = itemToIrRef(diff[2], false);
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
