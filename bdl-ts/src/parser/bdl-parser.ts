import type * as ast from "../generated/ast.ts";
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
} from "./parser.ts";

const topLevelKeywords = [
  "enum",
  "import",
  "oneof",
  "proc",
  "scalar",
  "socket",
  "struct",
  "union",
];

export default function parseBdl(text: string): ast.BdlAst {
  const parser = new Parser(text);
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
  return { attributes, statements };
}

const identPattern = /^\b[a-z_][a-z0-9_]*\b/i;
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
    acceptEnum,
    acceptImport,
    acceptOneof,
    acceptProc,
    acceptScalar,
    acceptSocket,
    acceptStruct,
    acceptUnion,
  ])(parser);
}

function acceptImport(parser: Parser): ast.Import | undefined {
  const keyword = parser.accept(/^\bimport\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const path = expectPath(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const items = zeroOrMore(choice([skipWsAndComments, acceptImportItem]))(
    parser,
  );
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Import",
    attributes: [],
    keyword,
    path,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptImportItem(parser: Parser): ast.ImportItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  acceptImportAlias;
  const alias = acceptImportAlias(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { name, alias, comma };
}

function acceptImportAlias(parser: Parser): ast.ImportAlias | undefined {
  const as = parser.accept(/^\bas\b/);
  if (!as) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  return { as, name };
}

function acceptScalar(parser: Parser): ast.Scalar | undefined {
  const keyword = parser.accept(/^\bscalar\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const eq = parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const scalarType = expectTypeExpression(parser);
  return {
    type: "Scalar",
    attributes: [],
    keyword,
    name,
    eq,
    scalarType,
  };
}

function acceptEnum(parser: Parser): ast.Enum | undefined {
  const keyword = parser.accept(/^\benum\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
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
  return {
    type: "Enum",
    attributes,
    keyword,
    name,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptEnumItem(parser: Parser): ast.EnumItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { attributes: [], name, comma };
}

function acceptOneof(parser: Parser): ast.Oneof | undefined {
  const keyword = parser.accept(/^\boneof\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
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
  return {
    type: "Oneof",
    attributes,
    keyword,
    name,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptOneofItem(parser: Parser): ast.OneofItem | undefined {
  const type = acceptTypeExpression(parser);
  if (!type) return;
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { attributes: [], type, comma };
}

function acceptUnion(parser: Parser): ast.Union | undefined {
  const keyword = parser.accept(/^\bunion\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
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
  return {
    type: "Union",
    attributes,
    keyword,
    name,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptUnionItem(parser: Parser): ast.UnionItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("(");
  const struct = bracketOpen &&
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
      const bracketClose = parser.expect(")", [], [identPattern]);
      return { bracketOpen, fields, bracketClose };
    })();
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { attributes: [], name, struct, comma };
}

function acceptStruct(parser: Parser): ast.Struct | undefined {
  const keyword = parser.accept(/^\bstruct\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
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
  return {
    type: "Struct",
    attributes,
    keyword,
    name,
    bracketOpen,
    fields,
    bracketClose,
  };
}

function acceptStructField(parser: Parser): ast.StructField | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const question = parser.accept("?");
  skipWsAndComments(parser);
  const colon = parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const itemType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return {
    attributes: [],
    name,
    question,
    colon,
    itemType,
    comma,
  };
}

function acceptProc(parser: Parser): ast.Proc | undefined {
  const keyword = parser.accept(/^\bproc\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const eq = parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const inputType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const arrow = parser.expect("->", [], [identPattern]);
  skipWsAndComments(parser);
  const outputType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const keywordThrows = parser.accept(/^\bthrows\b/);
  const error = keywordThrows &&
    (() => {
      skipWsAndComments(parser);
      const errorType = expectTypeExpression(parser);
      return { keywordThrows, errorType };
    })();
  return {
    type: "Proc",
    attributes: [],
    keyword,
    name,
    eq,
    inputType,
    arrow,
    outputType,
    error,
  };
}

function acceptSocket(parser: Parser): ast.Socket | undefined {
  const keyword = parser.accept(/^\bsocket\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const eq = parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const serverMessageType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const arrow = parser.expect("<->", [], [identPattern]);
  skipWsAndComments(parser);
  const clientMessageType = expectTypeExpression(parser);
  return {
    type: "Socket",
    attributes: [],
    keyword,
    name,
    eq,
    serverMessageType,
    arrow,
    clientMessageType,
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
      return { bracketOpen, keyType, bracketClose };
    })();
  return { valueType, container };
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
    if (attribute.symbol.type === "Sharp") {
      result.innerAttributes.push(attribute);
    } else {
      result.outerAttributes.push(attribute);
    }
  }
  return result;
}

function acceptAttribute(parser: Parser): ast.Attribute | undefined {
  const symbol = choice<ast.AttributeSymbol>([
    acceptTyped("Sharp", "#"),
    acceptTyped("At", "@"),
  ])(parser);
  if (!symbol) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const content = parser.accept(attributeContentPattern);
  return {
    symbol,
    name,
    content,
  };
}

const acceptPath = flipFlop<ast.Identifier, ast.Dot>(
  acceptIdentTyped,
  acceptDotTyped,
  skipWsAndComments,
);

function expectPath(parser: Parser): ast.PathItem[] {
  const path = acceptPath(parser);
  if (path.length < 1) throw new SyntaxError(parser, [identPattern]);
  return path;
}
