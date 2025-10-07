import type * as ast from "../../generated/ast.ts";
import {
  accept,
  acceptTyped,
  choice,
  eof,
  expect,
  flipFlop,
  Parser,
  SyntaxError,
  zeroOrMore,
} from "../parser.ts";

export { patternToString, SyntaxError } from "../parser.ts";

const topLevelKeywords = [
  "custom",
  "enum",
  "import",
  "oneof",
  "proc",
  "struct",
  "union",
];

export default function parseBdl(text: string): ast.BdlAst {
  const parser = new Parser(text);
  const offsetEncoding: ast.OffsetEncoding = "UTF16_CODE_UNIT";
  const attributes: ast.Attribute[] = [];
  const statements: ast.ModuleLevelStatement[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    if (parser.accept(eof)) {
      if (outerAttributes.length > 0) {
        throw new SyntaxError(parser, topLevelKeywords);
      }
      break;
    }
    const statement = acceptStatement(parser);
    if (!statement) {
      throw new SyntaxError(parser, topLevelKeywords, [identPattern]);
    }
    statement.attributes.push(...outerAttributes);
    statements.push(statement);
  }
  return { offsetEncoding, attributes, statements };
}

const identPattern = /^[a-z_][a-z0-9_]*\b/i;
const whitespacePattern = /^(?:\x20|\t|\r|\n)+/;
const singlelineCommentPattern = /^\/\/.*(?:\n|$)/;
const attributeContentPattern =
  /^- ?[^\n]*|^(?:(?:\x20|\t|\r)*\|[^\n]*(?:\n|$))+/;

const acceptComma = accept(",");
const acceptIdent = accept(identPattern);
const expectIdent = expect(identPattern);
const acceptIdentTyped = acceptTyped("Identifier", identPattern);
const acceptDotTyped = acceptTyped("Dot", ".");

function skipWsAndComments(parser: Parser): undefined {
  while (true) {
    const ws = parser.accept(whitespacePattern);
    if (ws) continue;
    const comment = parser.accept(singlelineCommentPattern);
    if (comment) continue;
    break;
  }
}

function acceptStatement(parser: Parser): ast.ModuleLevelStatement | undefined {
  return choice<ast.ModuleLevelStatement>([
    acceptCustom,
    acceptEnum,
    acceptImport,
    acceptOneof,
    acceptProc,
    acceptStruct,
    acceptUnion,
  ])(parser);
}

function acceptImport(parser: Parser): ast.Import | undefined {
  const keyword = parser.accept(/^import\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const path = expectPath(parser);
  skipWsAndComments(parser);
  parser.expect("{", [], [identPattern]);
  const items = zeroOrMore(choice([skipWsAndComments, acceptImportItem]))(
    parser,
  );
  const bracketClose = parser.expect("}", [], [identPattern]);
  const start = keyword.start;
  const end = bracketClose.end;
  return {
    start,
    end,
    type: "Import",
    attributes: [],
    path,
    items,
  };
}

function acceptImportItem(parser: Parser): ast.ImportItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const alias = acceptImportAlias(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  const start = name.start;
  const end = (comma ?? alias ?? name).end;
  return { start, end, name, alias };
}

function acceptImportAlias(parser: Parser): ast.Span | undefined {
  const as = parser.accept(/^as\b/);
  if (!as) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  return name;
}

function acceptCustom(parser: Parser): ast.Custom | undefined {
  const keyword = parser.accept(/^custom\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const originalType = expectTypeExpression(parser);
  const start = keyword.start;
  const end = originalType.end;
  return {
    type: "Custom",
    attributes: [],
    start,
    end,
    name,
    originalType,
  };
}

function acceptEnum(parser: Parser): ast.Enum | undefined {
  const keyword = parser.accept(/^enum\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  parser.expect("{", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const items: ast.EnumItem[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const item = acceptEnumItem(parser);
    if (!item) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, ["}"]);
      break;
    }
    item.attributes.push(...outerAttributes);
    items.push(item);
  }
  const bracketClose = parser.expect("}", [], [identPattern]);
  const start = keyword.start;
  const end = bracketClose.end;
  return {
    type: "Enum",
    attributes,
    start,
    end,
    name,
    items,
  };
}

function acceptEnumItem(parser: Parser): ast.EnumItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  const start = name.start;
  const end = (comma ?? name).end;
  return { attributes: [], start, end, name };
}

function acceptOneof(parser: Parser): ast.Oneof | undefined {
  const keyword = parser.accept(/^oneof\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  parser.expect("{", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const items: ast.OneofItem[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const item = acceptOneofItem(parser);
    if (!item) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, ["}"]);
      break;
    }
    item.attributes.push(...outerAttributes);
    items.push(item);
  }
  const bracketClose = parser.expect("}", [], [identPattern]);
  const start = keyword.start;
  const end = bracketClose.end;
  return {
    type: "Oneof",
    attributes,
    start,
    end,
    name,
    items,
  };
}

function acceptOneofItem(parser: Parser): ast.OneofItem | undefined {
  const itemType = acceptTypeExpression(parser);
  if (!itemType) return;
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  const start = itemType.start;
  const end = (comma ?? itemType).end;
  return { attributes: [], start, end, itemType };
}

function acceptUnion(parser: Parser): ast.Union | undefined {
  const keyword = parser.accept(/^union\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  parser.expect("{", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const items: ast.UnionItem[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const item = acceptUnionItem(parser);
    if (!item) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, ["}"]);
      break;
    }
    item.attributes.push(...outerAttributes);
    items.push(item);
  }
  const bracketClose = parser.expect("}", [], [identPattern]);
  const start = keyword.start;
  const end = bracketClose.end;
  return {
    type: "Union",
    attributes,
    start,
    end,
    name,
    items,
  };
}

function acceptUnionItem(parser: Parser): ast.UnionItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("(");
  let bracketClose: ast.Span | undefined;
  const fields = bracketOpen &&
    (() => {
      const attributes: ast.Attribute[] = [];
      const fields: ast.StructField[] = [];
      while (true) {
        const { innerAttributes, outerAttributes } = collectAttributes(parser);
        attributes.push(...innerAttributes);
        const field = acceptStructField(parser);
        if (!field) {
          if (outerAttributes.length > 0) throw new SyntaxError(parser, [")"]);
          break;
        }
        field.attributes.push(...outerAttributes);
        fields.push(field);
      }
      bracketClose = parser.expect(")", [], [identPattern]);
      return fields;
    })();
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  const start = name.start;
  const end = (comma ?? bracketClose ?? name).end;
  return { attributes: [], start, end, name, fields };
}

function acceptStruct(parser: Parser): ast.Struct | undefined {
  const keyword = parser.accept(/^struct\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  parser.expect("{", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const fields: ast.StructField[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const field = acceptStructField(parser);
    if (!field) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, ["}"]);
      break;
    }
    field.attributes.push(...outerAttributes);
    fields.push(field);
  }
  const bracketClose = parser.expect("}", [], [identPattern]);
  const start = keyword.start;
  const end = bracketClose.end;
  return {
    type: "Struct",
    attributes,
    start,
    end,
    name,
    fields,
  };
}

function acceptStructField(parser: Parser): ast.StructField | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const question = parser.accept("?");
  skipWsAndComments(parser);
  parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const fieldType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  const start = name.start;
  const end = (comma ?? fieldType).end;
  return {
    attributes: [],
    start,
    end,
    name,
    question,
    fieldType,
  };
}

function acceptProc(parser: Parser): ast.Proc | undefined {
  const keyword = parser.accept(/^proc\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const inputType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  parser.expect("->", [], [identPattern]);
  skipWsAndComments(parser);
  const outputType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const errorType = parser.accept(/^throws\b/) && (
    skipWsAndComments(parser), expectTypeExpression(parser)
  );
  const start = keyword.start;
  const end = (errorType ?? outputType).end;
  return {
    type: "Proc",
    attributes: [],
    start,
    end,
    name,
    inputType,
    outputType,
    errorType,
  };
}

function acceptTypeExpression(parser: Parser): ast.TypeExpression | undefined {
  const valueType = acceptIdent(parser);
  if (!valueType) return;
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("[");
  const container = bracketOpen &&
    (() => {
      const keyType = acceptIdent(parser);
      const bracketClose = parser.expect("]", [], [identPattern]);
      const start = bracketOpen.start;
      const end = bracketClose.end;
      return { start, end, keyType };
    })();
  const start = valueType.start;
  const end = (container ?? valueType).end;
  return { start, end, valueType, container };
}

function expectTypeExpression(parser: Parser): ast.TypeExpression {
  const type = acceptTypeExpression(parser);
  if (!type) throw new SyntaxError(parser, [identPattern]);
  return type;
}

interface CollectAttributesResult {
  innerAttributes: ast.Attribute[];
  outerAttributes: ast.Attribute[];
}
function collectAttributes(parser: Parser) {
  const result: CollectAttributesResult = {
    innerAttributes: [],
    outerAttributes: [],
  };
  while (true) {
    skipWsAndComments(parser);
    const attribute = acceptAttribute(parser);
    if (!attribute) break;
    if (parser.input[attribute.start] === "#") {
      result.innerAttributes.push(attribute);
    } else {
      result.outerAttributes.push(attribute);
    }
  }
  return result;
}

function acceptAttribute(parser: Parser): ast.Attribute | undefined {
  const symbol = parser.accept("#") || parser.accept("@");
  if (!symbol) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const content = parser.accept(attributeContentPattern);
  const start = symbol.start;
  const end = (content ?? name).end;
  return { start, end, name, content };
}

const acceptPath = flipFlop<
  ast.Span & { type: "Identifier" },
  ast.Span & { type: "Dot" }
>(
  acceptIdentTyped,
  acceptDotTyped,
  skipWsAndComments,
);

function expectPath(parser: Parser): ast.Span[] {
  const path = acceptPath(parser);
  if (path.length < 1) throw new SyntaxError(parser, [identPattern]);
  return path.filter((item) => item.type === "Identifier").map(
    ({ start, end }) => ({ start, end }),
  );
}
