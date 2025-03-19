import type * as ir from "./generated/ir.ts";
import type * as irDiff from "./generated/ir-diff.ts";
import type * as irRef from "./generated/ir-ref.ts";

export function diffBdlIr(prev: ir.BdlIr, next: ir.BdlIr): irDiff.BdlIrDiff {
  return {
    modules: diffModules(prev.modules, next.modules, (ref) => ref),
    defs: diffDefs(prev.defs, next.defs, (ref) => ref),
  };
}

function diffModules(
  prev: Record<string, ir.Module>,
  next: Record<string, ir.Module>,
  refToIrRef: (ref: irRef.Module, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffRecordKeys(prev, next),
    refToIrRef,
    itemToRef: (path): irRef.Module => ({
      type: "Module",
      path,
      ref: { type: "This" },
    }),
    nested: {
      getTarget: (key, isPrev) => (isPrev ? prev : next)[key],
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffModule(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffModule(
  prev: ir.Module,
  next: ir.Module,
  refToIrRef: (ref: irRef.ModuleRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...convertDiffs({
      diffs: diffPrimitive(prev.fileUrl, next.fileUrl),
      refToIrRef,
      itemToRef: (): irRef.FileUrl => ({ type: "FileUrl" }),
    }),
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...convertDiffs({
      diffs: diffArray(prev.defPaths, next.defPaths),
      refToIrRef,
      itemToRef: (index, isPrev): irRef.DefPath => ({
        type: "DefPath",
        index: (isPrev ? prev.defPaths : next.defPaths).indexOf(index),
      }),
    }),
    ...diffImports(prev.imports, next.imports, refToIrRef),
  ];
}

function diffImports(
  prev: ir.Import[],
  next: ir.Import[],
  refToIrRef: (ref: irRef.Import, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffArray(prev, next, (p, n) => p.modulePath === n.modulePath),
    refToIrRef,
    itemToRef: (item, isPrev): irRef.Import => ({
      type: "Import",
      index: (isPrev ? prev : next).indexOf(item),
      ref: { type: "This" },
    }),
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffImport(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffImport(
  prev: ir.Import,
  next: ir.Import,
  refToIrRef: (ref: irRef.ImportRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...diffImportItems(prev.items, next.items, refToIrRef),
  ];
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

function diffDefs(
  prev: Record<string, ir.Def>,
  next: Record<string, ir.Def>,
  refToIrRef: (ref: irRef.Def, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffRecordKeys(prev, next),
    refToIrRef,
    itemToRef: (path): irRef.Def => ({
      type: "Def",
      path,
      ref: { type: "This" },
    }),
    nested: {
      getTarget: (key, isPrev) => (isPrev ? prev : next)[key],
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffDef(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffDef(
  prev: ir.Def,
  next: ir.Def,
  refToIrRef: (ref: irRef.DefRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...convertDiffs({
      diffs: diffPrimitive(prev.name, next.name),
      refToIrRef,
      itemToRef: (): irRef.Name => ({ type: "Name" }),
    }),
    ...diffDefBody(
      prev.body,
      next.body,
      (ref, isPrev) => refToIrRef({ type: "Body", ref }, isPrev),
    ),
  ];
}

function diffDefBody(
  prev: ir.DefBody,
  next: ir.DefBody,
  refToIrRef: (ref: irRef.DefBodyRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: prev.type === next.type
      ? [["keep", prev, next]]
      : [["replace", prev, next]],
    refToIrRef,
    itemToRef: (): irRef.DefBodyRef => ({ type: "This" }),
    nested: {
      getTarget: (body) => body,
      diffFn: ({ prevTarget, nextTarget }) => {
        if (prevTarget.type === "Enum" && nextTarget.type === "Enum") {
          return diffEnum(prevTarget, nextTarget, refToIrRef);
        }
        if (prevTarget.type === "Oneof" && nextTarget.type === "Oneof") {
          return diffOneof(prevTarget, nextTarget, refToIrRef);
        }
        if (prevTarget.type === "Proc" && nextTarget.type === "Proc") {
          return diffProc(
            prevTarget,
            nextTarget,
            (ref, isPrev) => refToIrRef({ type: "Proc", ref }, isPrev),
          );
        }
        if (prevTarget.type === "Scalar" && nextTarget.type === "Scalar") {
          return diffScalar(
            prevTarget,
            nextTarget,
            (typeRef, isPrev) =>
              refToIrRef({ type: "Scalar", typeRef }, isPrev),
          );
        }
        if (prevTarget.type === "Struct" && nextTarget.type === "Struct") {
          return diffStruct(prevTarget, nextTarget, refToIrRef);
        }
        if (prevTarget.type === "Union" && nextTarget.type === "Union") {
          return diffUnion(prevTarget, nextTarget, refToIrRef);
        }
        throw "unreachable";
      },
    },
  });
}

function diffEnum(
  prev: ir.Enum,
  next: ir.Enum,
  refToIrRef: (ref: irRef.Enum, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffArray(prev.items, next.items, (p, n) => p.name == n.name),
    refToIrRef,
    itemToRef: (item, isPrev): irRef.Enum => {
      const index = (isPrev ? prev : next).items.indexOf(item);
      return { type: "Enum", index, ref: { type: "Name" } };
    },
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffEnumItem(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffEnumItem(
  prev: ir.EnumItem,
  next: ir.EnumItem,
  refToIrRef: (ref: irRef.EnumItemRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...convertDiffs({
      diffs: diffPrimitive(prev.name, next.name),
      refToIrRef,
      itemToRef: (): irRef.Name => ({ type: "Name" }),
    }),
  ];
}

function diffOneof(
  prev: ir.Oneof,
  next: ir.Oneof,
  refToIrRef: (ref: irRef.Oneof, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffArray(
      prev.items,
      next.items,
      (p, n) => typeEq(p.itemType, n.itemType),
    ),
    refToIrRef,
    itemToRef: (item, isPrev): irRef.Oneof => {
      const index = (isPrev ? prev : next).items.indexOf(item);
      return {
        type: "Oneof",
        index,
        ref: { type: "ItemType", ref: { type: "This" } },
      };
    },
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffOneofItem(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function typeEq(a: ir.Type, b: ir.Type) {
  if (a.type != b.type) return false;
  if (a.type == "Plain" && b.type == "Plain") {
    return a.valueTypePath == b.valueTypePath;
  }
  if (a.type == "Array" && b.type == "Array") {
    return a.valueTypePath == b.valueTypePath;
  }
  if (a.type == "Dictionary" && b.type == "Dictionary") {
    return a.valueTypePath == b.valueTypePath && a.keyTypePath == b.keyTypePath;
  }
  throw "unreachable";
}

function diffOneofItem(
  prev: ir.OneofItem,
  next: ir.OneofItem,
  refToIrRef: (ref: irRef.OneofItemRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...diffType(
      prev.itemType,
      next.itemType,
      (ref, isPrev) => refToIrRef({ type: "ItemType", ref }, isPrev),
    ),
  ];
}

function diffProc(
  prev: ir.Proc,
  next: ir.Proc,
  refToIrRef: (ref: irRef.ProcRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffType(
      prev.inputType,
      next.inputType,
      (ref, isPrev) => refToIrRef({ type: "InputType", ref }, isPrev),
    ),
    ...diffType(
      prev.outputType,
      next.outputType,
      (ref, isPrev) => refToIrRef({ type: "OutputType", ref }, isPrev),
    ),
    ...diffType(
      prev.errorType,
      next.errorType,
      (ref, isPrev) => refToIrRef({ type: "ErrorType", ref }, isPrev),
    ),
  ];
}

function diffScalar(
  prev: ir.Scalar,
  next: ir.Scalar,
  refToIrRef: (ref: irRef.TypeRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return diffType(prev.scalarType, next.scalarType, refToIrRef);
}

function diffStruct(
  prev: ir.Struct,
  next: ir.Struct,
  refToIrRef: (ref: irRef.Struct, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffArray(prev.fields, next.fields, (p, n) => p.name == n.name),
    refToIrRef,
    itemToRef: (field, isPrev): irRef.Struct => {
      const index = (isPrev ? prev : next).fields.indexOf(field);
      return { type: "Struct", index, ref: { type: "This" } };
    },
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffStructField(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffStructField(
  prev: ir.StructField,
  next: ir.StructField,
  refToIrRef: (ref: irRef.StructFieldRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...convertDiffs({
      diffs: diffPrimitive(prev.name, next.name),
      refToIrRef,
      itemToRef: (): irRef.Name => ({ type: "Name" }),
    }),
    ...diffType(
      prev.fieldType,
      next.fieldType,
      (ref, isPrev) => refToIrRef({ type: "FieldType", ref }, isPrev),
    ),
  ];
}

function diffUnion(
  prev: ir.Union,
  next: ir.Union,
  refToIrRef: (ref: irRef.Union, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: diffArray(prev.items, next.items, (p, n) => p.name == n.name),
    refToIrRef,
    itemToRef: (item, isPrev): irRef.Union => {
      const index = (isPrev ? prev : next).items.indexOf(item);
      return { type: "Union", index, ref: { type: "This" } };
    },
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
        diffUnionItem(
          prevTarget,
          nextTarget,
          (ref, isPrev) =>
            refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
        ),
    },
  });
}

function diffUnionItem(
  prev: ir.UnionItem,
  next: ir.UnionItem,
  refToIrRef: (ref: irRef.UnionItemRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return [
    ...diffAttributes(prev.attributes, next.attributes, refToIrRef),
    ...convertDiffs({
      diffs: diffArray(prev.fields, next.fields, (p, n) => p.name == n.name),
      refToIrRef,
      itemToRef: (item, isPrev): irRef.Fields => {
        const index = (isPrev ? prev : next).fields.indexOf(item);
        return { type: "Fields", index, ref: { type: "This" } };
      },
      nested: {
        getTarget: (item) => item,
        diffFn: ({ prevRef, prevTarget, nextRef, nextTarget }) =>
          diffStructField(
            prevTarget,
            nextTarget,
            (ref, isPrev) =>
              refToIrRef({ ...(isPrev ? prevRef : nextRef), ref }, isPrev),
          ),
      },
    }),
  ];
}

function diffType(
  prev: ir.Type | undefined,
  next: ir.Type | undefined,
  refToIrRef: (ref: irRef.TypeRef, isPrev: boolean) => irRef.BdlIrRef,
): irDiff.DiffItem[] {
  return convertDiffs({
    diffs: (() => {
      if (prev?.type == null && next?.type != null) return [["add", next]];
      if (prev?.type != null && next?.type == null) return [["remove", prev]];
      if (prev?.type != null && next?.type != null) {
        if (prev.type === next.type) return [["keep", prev, next]];
        return [["replace", prev, next]];
      }
      return [];
    })(),
    refToIrRef,
    itemToRef: (): irRef.TypeRef => ({ type: "This" }),
    nested: {
      getTarget: (item) => item,
      diffFn: ({ prevTarget: p, nextTarget: n }) => {
        if (p.type === "Plain" && n.type === "Plain") {
          return convertDiffs({
            diffs: diffPrimitive(
              p.valueTypePath,
              n.valueTypePath,
            ),
            refToIrRef,
            itemToRef: (): irRef.ValueTypePath => ({ type: "ValueTypePath" }),
          });
        }
        if (p.type === "Array" && n.type === "Array") {
          return convertDiffs({
            diffs: diffPrimitive(
              p.valueTypePath,
              n.valueTypePath,
            ),
            refToIrRef,
            itemToRef: (): irRef.ValueTypePath => ({ type: "ValueTypePath" }),
          });
        }
        if (
          p.type === "Dictionary" && n.type === "Dictionary"
        ) {
          return [
            ...convertDiffs({
              diffs: diffPrimitive(
                p.valueTypePath,
                n.valueTypePath,
              ),
              refToIrRef,
              itemToRef: (): irRef.ValueTypePath => ({ type: "ValueTypePath" }),
            }),
            ...convertDiffs({
              diffs: diffPrimitive(
                p.keyTypePath,
                n.keyTypePath,
              ),
              refToIrRef,
              itemToRef: (): irRef.KeyTypePath => ({ type: "KeyTypePath" }),
            }),
          ];
        }
        throw "unreachable";
      },
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
        if (items.every((item) => item.type === "Keep")) {
          return { type: "Keep", prevRef: _prevRef };
        }
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
