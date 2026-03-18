import { assertEquals } from "@std/assert";
import type * as ir from "./generated/ir.ts";

export interface CompareStructuralTypesResult {
  equivalent: boolean;
  leftContainsRight: boolean;
  rightContainsLeft: boolean;
}

export class CompareStructuralTypesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CompareStructuralTypesError";
  }
}

interface CompareContext {
  ir: ir.BdlIr;
  containsMemo: Map<string, boolean>;
  activeContains: Set<string>;
}

type ResolvedTypePath =
  | {
    kind: "Primitive";
    path: string;
  }
  | {
    kind: "Def";
    path: string;
    def: ir.Def;
  }
  | {
    kind: "UnionItem";
    path: string;
    item: ir.UnionItem;
  };

export function compareStructuralTypes(
  irGraph: ir.BdlIr,
  leftTypePath: string,
  rightTypePath: string,
): CompareStructuralTypesResult {
  const ctx: CompareContext = {
    ir: irGraph,
    containsMemo: new Map(),
    activeContains: new Set(),
  };
  const leftContainsRight = containsPlainTypePath(
    ctx,
    leftTypePath,
    rightTypePath,
  );
  const rightContainsLeft = containsPlainTypePath(
    ctx,
    rightTypePath,
    leftTypePath,
  );
  return {
    equivalent: leftContainsRight && rightContainsLeft,
    leftContainsRight,
    rightContainsLeft,
  };
}

function containsType(
  ctx: CompareContext,
  left: ir.Type,
  right: ir.Type,
): boolean {
  left = expandCustomType(ctx, left);
  right = expandCustomType(ctx, right);
  if (left.type !== right.type) return false;
  switch (left.type) {
    case "Plain":
      if (right.type !== "Plain") return false;
      return containsPlainTypePath(
        ctx,
        left.valueTypePath,
        right.valueTypePath,
      );
    case "Array":
      if (right.type !== "Array") return false;
      return containsPlainTypePath(
        ctx,
        left.valueTypePath,
        right.valueTypePath,
      );
    case "Dictionary":
      if (right.type !== "Dictionary") return false;
      return (
        containsPlainTypePath(ctx, left.keyTypePath, right.keyTypePath) &&
        containsPlainTypePath(ctx, left.valueTypePath, right.valueTypePath)
      );
  }
}

function containsPlainTypePath(
  ctx: CompareContext,
  leftTypePath: string,
  rightTypePath: string,
): boolean {
  return containsResolvedTypePath(
    ctx,
    resolveTypePath(ctx.ir, leftTypePath),
    resolveTypePath(ctx.ir, rightTypePath),
  );
}

function containsResolvedTypePath(
  ctx: CompareContext,
  left: ResolvedTypePath,
  right: ResolvedTypePath,
): boolean {
  const key = `${left.path}=>${right.path}`;
  const cached = ctx.containsMemo.get(key);
  if (cached != null) return cached;
  if (ctx.activeContains.has(key)) return true;
  ctx.activeContains.add(key);
  const result = computeContainsResolvedTypePath(ctx, left, right);
  ctx.activeContains.delete(key);
  ctx.containsMemo.set(key, result);
  return result;
}

function computeContainsResolvedTypePath(
  ctx: CompareContext,
  left: ResolvedTypePath,
  right: ResolvedTypePath,
): boolean {
  if (left.kind === "Def" && left.def.type === "Custom") {
    return containsType(ctx, left.def.originalType, resolvedToType(right));
  }
  if (right.kind === "Def" && right.def.type === "Custom") {
    return containsType(ctx, resolvedToType(left), right.def.originalType);
  }
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "Primitive":
      if (right.kind !== "Primitive") return false;
      return left.path === right.path;
    case "UnionItem":
      if (right.kind !== "UnionItem") return false;
      return containsStructFields(ctx, left.item.fields, right.item.fields);
    case "Def":
      if (right.kind !== "Def") return false;
      if (left.def.type === "Custom" || right.def.type === "Custom") {
        throw new CompareStructuralTypesError(
          "Custom type expansion should be handled before def comparison.",
        );
      }
      return containsDefs(ctx, left.def, right.def);
  }
}

function containsDefs(
  ctx: CompareContext,
  left: Exclude<ir.Def, ir.Custom>,
  right: Exclude<ir.Def, ir.Custom>,
): boolean {
  if (left.type !== right.type) return false;
  switch (left.type) {
    case "Enum":
      if (right.type !== "Enum") return false;
      return containsEnum(left, right);
    case "Oneof":
      if (right.type !== "Oneof") return false;
      return containsOneof(ctx, left, right);
    case "Proc":
      if (right.type !== "Proc") return false;
      return containsProc(ctx, left, right);
    case "Struct":
      if (right.type !== "Struct") return false;
      return containsStruct(ctx, left, right);
    case "Union":
      if (right.type !== "Union") return false;
      return containsUnion(ctx, left, right);
  }
}

function containsEnum(left: ir.Enum, right: ir.Enum): boolean {
  const leftValues = new Set(left.items.map(getEnumValue));
  return right.items.every((item) => leftValues.has(getEnumValue(item)));
}

function containsOneof(
  ctx: CompareContext,
  left: ir.Oneof,
  right: ir.Oneof,
): boolean {
  return matchItems(
    left.items,
    right.items,
    (leftItem, rightItem) =>
      containsType(ctx, leftItem.itemType, rightItem.itemType),
  );
}

function containsProc(
  ctx: CompareContext,
  left: ir.Proc,
  right: ir.Proc,
): boolean {
  return (
    containsType(ctx, left.inputType, right.inputType) &&
    containsType(ctx, left.outputType, right.outputType) &&
    containsOptionalType(ctx, left.errorType, right.errorType)
  );
}

function containsOptionalType(
  ctx: CompareContext,
  left: ir.Type | undefined,
  right: ir.Type | undefined,
): boolean {
  if (!right) return true;
  if (!left) return false;
  return containsType(ctx, left, right);
}

function containsStruct(
  ctx: CompareContext,
  left: ir.Struct,
  right: ir.Struct,
): boolean {
  return containsStructFields(ctx, left.fields, right.fields);
}

function containsStructFields(
  ctx: CompareContext,
  left: ir.StructField[],
  right: ir.StructField[],
): boolean {
  const leftFields = new Map(left.map((field) => [field.name, field]));
  return right.every((rightField) => {
    const leftField = leftFields.get(rightField.name);
    if (!leftField) return false;
    if (leftField.optional && !rightField.optional) return false;
    return containsType(ctx, leftField.fieldType, rightField.fieldType);
  });
}

function containsUnion(
  ctx: CompareContext,
  left: ir.Union,
  right: ir.Union,
): boolean {
  const leftItems = new Map(left.items.map((item) => [item.name, item]));
  return right.items.every((rightItem) => {
    const leftItem = leftItems.get(rightItem.name);
    if (!leftItem) return false;
    return containsStructFields(ctx, leftItem.fields, rightItem.fields);
  });
}

function matchItems<TLeft, TRight>(
  leftItems: TLeft[],
  rightItems: TRight[],
  matches: (left: TLeft, right: TRight) => boolean,
): boolean {
  const candidates = rightItems.map((rightItem, rightIndex) => ({
    rightIndex,
    leftIndices: leftItems.flatMap((leftItem, leftIndex) =>
      matches(leftItem, rightItem) ? [leftIndex] : []
    ),
  })).sort((a, b) => a.leftIndices.length - b.leftIndices.length);
  const usedLeft = new Set<number>();
  return visitCandidate(0);

  function visitCandidate(candidateIndex: number): boolean {
    if (candidateIndex >= candidates.length) return true;
    const candidate = candidates[candidateIndex];
    for (const leftIndex of candidate.leftIndices) {
      if (usedLeft.has(leftIndex)) continue;
      usedLeft.add(leftIndex);
      if (visitCandidate(candidateIndex + 1)) return true;
      usedLeft.delete(leftIndex);
    }
    return false;
  }
}

function getEnumValue(item: ir.EnumItem): string {
  return item.attributes.value || item.name;
}

function expandCustomType(ctx: CompareContext, type: ir.Type): ir.Type {
  if (type.type !== "Plain") return type;
  const seenPaths = new Set<string>();
  let current: ir.Type = type;
  while (current.type === "Plain") {
    if (seenPaths.has(current.valueTypePath)) break;
    seenPaths.add(current.valueTypePath);
    const def: ir.Def | undefined = ctx.ir.defs[current.valueTypePath];
    if (!def || def.type !== "Custom") break;
    current = def.originalType;
  }
  return current;
}

function resolveTypePath(
  irGraph: ir.BdlIr,
  typePath: string,
): ResolvedTypePath {
  const unionItem = resolveUnionItemPath(irGraph, typePath);
  if (unionItem) return { kind: "UnionItem", path: typePath, item: unionItem };
  const def = irGraph.defs[typePath];
  if (def) return { kind: "Def", path: typePath, def };
  if (!typePath.includes(".") && !typePath.includes("::")) {
    return { kind: "Primitive", path: typePath };
  }
  throw new CompareStructuralTypesError(`Unknown type path: ${typePath}`);
}

function resolveUnionItemPath(
  irGraph: ir.BdlIr,
  typePath: string,
): ir.UnionItem | undefined {
  const delimiter = typePath.lastIndexOf("::");
  if (delimiter === -1) return;
  const unionPath = typePath.slice(0, delimiter);
  const itemName = typePath.slice(delimiter + 2);
  const def = irGraph.defs[unionPath];
  if (!def || def.type !== "Union") return;
  return def.items.find((item) => item.name === itemName);
}

function resolvedToType(resolved: ResolvedTypePath): ir.Type {
  return {
    type: "Plain",
    valueTypePath: resolved.path,
  };
}

Deno.test("compareStructuralTypes treats custom aliases and container shapes structurally", () => {
  const irGraph: ir.BdlIr = {
    modules: {
      "pkg.types": {
        attributes: {},
        defPaths: [
          "pkg.types.Email",
          "pkg.types.EmailAlias",
          "pkg.types.Tags",
          "pkg.types.TagsAlias",
          "pkg.types.Metadata",
          "pkg.types.MetadataAlias",
        ],
        imports: [],
      },
    },
    defs: {
      "pkg.types.Email": {
        type: "Custom",
        attributes: {},
        name: "Email",
        originalType: { type: "Plain", valueTypePath: "string" },
      },
      "pkg.types.EmailAlias": {
        type: "Custom",
        attributes: {},
        name: "EmailAlias",
        originalType: { type: "Plain", valueTypePath: "pkg.types.Email" },
      },
      "pkg.types.Tags": {
        type: "Custom",
        attributes: {},
        name: "Tags",
        originalType: { type: "Array", valueTypePath: "string" },
      },
      "pkg.types.TagsAlias": {
        type: "Custom",
        attributes: {},
        name: "TagsAlias",
        originalType: { type: "Array", valueTypePath: "pkg.types.EmailAlias" },
      },
      "pkg.types.Metadata": {
        type: "Custom",
        attributes: {},
        name: "Metadata",
        originalType: {
          type: "Dictionary",
          keyTypePath: "string",
          valueTypePath: "pkg.types.Email",
        },
      },
      "pkg.types.MetadataAlias": {
        type: "Custom",
        attributes: {},
        name: "MetadataAlias",
        originalType: {
          type: "Dictionary",
          keyTypePath: "string",
          valueTypePath: "string",
        },
      },
    },
  };

  assertEquals(compareStructuralTypes(irGraph, "pkg.types.Email", "string"), {
    equivalent: true,
    leftContainsRight: true,
    rightContainsLeft: true,
  });
  assertEquals(
    compareStructuralTypes(irGraph, "pkg.types.Tags", "pkg.types.TagsAlias"),
    {
      equivalent: true,
      leftContainsRight: true,
      rightContainsLeft: true,
    },
  );
  assertEquals(
    compareStructuralTypes(
      irGraph,
      "pkg.types.Metadata",
      "pkg.types.MetadataAlias",
    ),
    {
      equivalent: true,
      leftContainsRight: true,
      rightContainsLeft: true,
    },
  );
});

Deno.test("compareStructuralTypes reports struct containment with optional fields", () => {
  const irGraph: ir.BdlIr = {
    modules: {
      "pkg.model": {
        attributes: {},
        defPaths: ["pkg.model.User", "pkg.model.UserSummary"],
        imports: [],
      },
    },
    defs: {
      "pkg.model.User": {
        type: "Struct",
        attributes: {},
        name: "User",
        fields: [{
          attributes: {},
          name: "id",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: false,
        }, {
          attributes: {},
          name: "email",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: false,
        }, {
          attributes: {},
          name: "nickname",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: true,
        }],
      },
      "pkg.model.UserSummary": {
        type: "Struct",
        attributes: {},
        name: "UserSummary",
        fields: [{
          attributes: {},
          name: "id",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: false,
        }, {
          attributes: {},
          name: "email",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: false,
        }],
      },
    },
  };

  assertEquals(
    compareStructuralTypes(irGraph, "pkg.model.User", "pkg.model.UserSummary"),
    {
      equivalent: false,
      leftContainsRight: true,
      rightContainsLeft: false,
    },
  );
});

Deno.test("compareStructuralTypes matches enum and oneof shapes structurally", () => {
  const irGraph: ir.BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: [
          "pkg.api.StatusA",
          "pkg.api.StatusB",
          "pkg.api.ResultA",
          "pkg.api.ResultB",
        ],
        imports: [],
      },
    },
    defs: {
      "pkg.api.StatusA": {
        type: "Enum",
        attributes: {},
        name: "StatusA",
        items: [{
          attributes: { value: "ok" },
          name: "Success",
        }, {
          attributes: { value: "error" },
          name: "Failure",
        }],
      },
      "pkg.api.StatusB": {
        type: "Enum",
        attributes: {},
        name: "StatusB",
        items: [{
          attributes: { value: "error" },
          name: "Oops",
        }, {
          attributes: { value: "ok" },
          name: "Done",
        }],
      },
      "pkg.api.ResultA": {
        type: "Oneof",
        attributes: {},
        name: "ResultA",
        items: [{
          attributes: {},
          itemType: { type: "Plain", valueTypePath: "pkg.api.StatusA" },
        }, {
          attributes: {},
          itemType: { type: "Plain", valueTypePath: "string" },
        }],
      },
      "pkg.api.ResultB": {
        type: "Oneof",
        attributes: {},
        name: "ResultB",
        items: [{
          attributes: {},
          itemType: { type: "Plain", valueTypePath: "string" },
        }, {
          attributes: {},
          itemType: { type: "Plain", valueTypePath: "pkg.api.StatusB" },
        }],
      },
    },
  };

  assertEquals(
    compareStructuralTypes(irGraph, "pkg.api.StatusA", "pkg.api.StatusB"),
    {
      equivalent: true,
      leftContainsRight: true,
      rightContainsLeft: true,
    },
  );
  assertEquals(
    compareStructuralTypes(irGraph, "pkg.api.ResultA", "pkg.api.ResultB"),
    {
      equivalent: true,
      leftContainsRight: true,
      rightContainsLeft: true,
    },
  );
});

Deno.test("compareStructuralTypes reports union containment and supports union item paths", () => {
  const irGraph: ir.BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: ["pkg.api.Response", "pkg.api.ResponseLite"],
        imports: [],
      },
    },
    defs: {
      "pkg.api.Response": {
        type: "Union",
        attributes: {},
        name: "Response",
        items: [{
          attributes: {},
          name: "Ok",
          fields: [{
            attributes: {},
            name: "id",
            fieldType: { type: "Plain", valueTypePath: "string" },
            optional: false,
          }],
        }, {
          attributes: {},
          name: "Error",
          fields: [{
            attributes: {},
            name: "message",
            fieldType: { type: "Plain", valueTypePath: "string" },
            optional: false,
          }, {
            attributes: {},
            name: "retryable",
            fieldType: { type: "Plain", valueTypePath: "boolean" },
            optional: true,
          }],
        }],
      },
      "pkg.api.ResponseLite": {
        type: "Union",
        attributes: {},
        name: "ResponseLite",
        items: [{
          attributes: {},
          name: "Ok",
          fields: [{
            attributes: {},
            name: "id",
            fieldType: { type: "Plain", valueTypePath: "string" },
            optional: false,
          }],
        }],
      },
    },
  };

  assertEquals(
    compareStructuralTypes(irGraph, "pkg.api.Response", "pkg.api.ResponseLite"),
    {
      equivalent: false,
      leftContainsRight: true,
      rightContainsLeft: false,
    },
  );
  assertEquals(
    compareStructuralTypes(
      irGraph,
      "pkg.api.Response::Error",
      "pkg.api.Response::Error",
    ),
    {
      equivalent: true,
      leftContainsRight: true,
      rightContainsLeft: true,
    },
  );
});

Deno.test("compareStructuralTypes compares proc signatures structurally", () => {
  const irGraph: ir.BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: [
          "pkg.api.GetUserInput",
          "pkg.api.GetUserInputDetailed",
          "pkg.api.GetUserOutput",
          "pkg.api.GetUserError",
          "pkg.api.GetUser",
          "pkg.api.GetUserDetailed",
        ],
        imports: [],
      },
    },
    defs: {
      "pkg.api.GetUserInput": {
        type: "Struct",
        attributes: {},
        name: "GetUserInput",
        fields: [{
          attributes: {},
          name: "id",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: false,
        }],
      },
      "pkg.api.GetUserInputDetailed": {
        type: "Struct",
        attributes: {},
        name: "GetUserInputDetailed",
        fields: [{
          attributes: {},
          name: "id",
          fieldType: { type: "Plain", valueTypePath: "string" },
          optional: false,
        }, {
          attributes: {},
          name: "includePosts",
          fieldType: { type: "Plain", valueTypePath: "boolean" },
          optional: true,
        }],
      },
      "pkg.api.GetUserOutput": {
        type: "Oneof",
        attributes: {},
        name: "GetUserOutput",
        items: [{
          attributes: {},
          itemType: { type: "Plain", valueTypePath: "string" },
        }],
      },
      "pkg.api.GetUserError": {
        type: "Union",
        attributes: {},
        name: "GetUserError",
        items: [{
          attributes: {},
          name: "NotFound",
          fields: [{
            attributes: {},
            name: "message",
            fieldType: { type: "Plain", valueTypePath: "string" },
            optional: false,
          }],
        }],
      },
      "pkg.api.GetUser": {
        type: "Proc",
        attributes: {},
        name: "GetUser",
        inputType: { type: "Plain", valueTypePath: "pkg.api.GetUserInput" },
        outputType: { type: "Plain", valueTypePath: "pkg.api.GetUserOutput" },
        errorType: { type: "Plain", valueTypePath: "pkg.api.GetUserError" },
      },
      "pkg.api.GetUserDetailed": {
        type: "Proc",
        attributes: {},
        name: "GetUserDetailed",
        inputType: {
          type: "Plain",
          valueTypePath: "pkg.api.GetUserInputDetailed",
        },
        outputType: { type: "Plain", valueTypePath: "pkg.api.GetUserOutput" },
        errorType: { type: "Plain", valueTypePath: "pkg.api.GetUserError" },
      },
    },
  };

  assertEquals(
    compareStructuralTypes(
      irGraph,
      "pkg.api.GetUserDetailed",
      "pkg.api.GetUser",
    ),
    {
      equivalent: false,
      leftContainsRight: true,
      rightContainsLeft: false,
    },
  );
});
