import * as ast from "../ast";
import {
  Parser,
  SyntaxError,
  accept,
  acceptTyped,
  choice,
  eof,
  expect,
  flipFlop,
  zeroOrMore,
} from "./parser";

const topLevelKeywords = [
  "enum",
  "import",
  "package",
  "rpc",
  "scalar",
  "socket",
  "struct",
  "union",
];

export default function parseJcl(text: string): ast.JclAst {
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

const whitespacePattern = /^(?:\x20|\t|\r|\n)+/;
const singlelineCommentPattern = /^\/\/.*(?:\n|$)/;
const stringLiteralPattern = /^"(?:\\x[0-9a-f]{2}|\\[nrtv\\"]|[^"\n\\])*"/i;
const identPattern = /^[a-z_][a-z0-9_]*/i;

const acceptComma = accept(",");
const acceptStringLiteral = accept(stringLiteralPattern);
const expectStringLiteral = expect(stringLiteralPattern);
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
    acceptRpc,
    acceptScalar,
    acceptSocket,
    acceptStruct,
    acceptUnion,
  ])(parser);
}

function acceptImport(parser: Parser): ast.Import | undefined {
  const keyword = parser.accept("import");
  if (!keyword) return;
  skipWsAndComments(parser);
  const path = expectPath(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const items = zeroOrMore(choice([skipWsAndComments, acceptImportItem]))(
    parser
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
  const as = parser.accept("as");
  if (!as) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  return { as, name };
}

function acceptScalar(parser: Parser): ast.Scalar | undefined {
  const keyword = parser.accept("scalar");
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
  const keyword = parser.accept("enum");
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
  const eq = parser.expect("=", [], [identPattern, stringLiteralPattern]);
  skipWsAndComments(parser);
  const value = expectStringLiteral(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { attributes: [], name, eq, value, comma };
}

function acceptUnion(parser: Parser): ast.Union | undefined {
  const keyword = parser.accept("union");
  if (!keyword) return;
  skipWsAndComments(parser);
  const discriminatorKey = acceptStringLiteral(parser);
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
    discriminatorKey,
    name,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptUnionItem(parser: Parser): ast.UnionItem | undefined {
  const loc = parser.loc;
  const jsonKey = acceptStringLiteral(parser);
  skipWsAndComments(parser);
  const name = acceptIdent(parser);
  if (!name) {
    parser.loc = loc;
    return;
  }
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("(");
  const struct =
    bracketOpen &&
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
  return { attributes: [], jsonKey, name, struct, comma };
}

function acceptStruct(parser: Parser): ast.Struct | undefined {
  const keyword = parser.accept("struct");
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
  const nullPolicySymbol = choice<ast.NullPolicySymbol>([
    acceptTyped("Exclamation", "!"),
    acceptTyped("Question", "?"),
  ])(parser);
  skipWsAndComments(parser);
  const colon = parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const itemType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return {
    attributes: [],
    name,
    nullPolicySymbol,
    colon,
    itemType,
    comma,
  };
}

function acceptRpc(parser: Parser): ast.Rpc | undefined {
  const keyword = parser.accept("rpc");
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const items: ast.RpcItem[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const item = acceptRpcItem(parser);
    if (!item) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, ["}"]);
      break;
    }
    item.attributes.push(...outerAttributes);
    items.push(item);
  }
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Rpc",
    attributes,
    keyword,
    name,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptRpcItem(parser: Parser): ast.RpcItem | undefined {
  const loc = parser.loc;
  const keywordStream = parser.accept("stream");
  skipWsAndComments(parser);
  const name = acceptIdent(parser);
  if (!name) {
    parser.loc = loc;
    return;
  }
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("(", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const inputFields: ast.StructField[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const item = acceptStructField(parser);
    if (!item) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, [")"]);
      break;
    }
    item.attributes.push(...outerAttributes);
    inputFields.push(item);
  }
  const bracketClose = parser.expect(")", [], [identPattern]);
  skipWsAndComments(parser);
  const colon = parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const outputType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const keywordThrows = parser.accept("throws");
  const error =
    keywordThrows &&
    (() => {
      skipWsAndComments(parser);
      const errorType = expectTypeExpression(parser);
      return { keywordThrows, errorType };
    })();
  const comma = acceptComma(parser);
  return {
    attributes,
    keywordStream,
    name,
    bracketOpen,
    inputFields,
    bracketClose,
    colon,
    outputType,
    error,
    comma,
  };
}

function acceptSocket(parser: Parser): ast.Socket | undefined {
  const keyword = parser.accept("socket");
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const attributes: ast.Attribute[] = [];
  const items: ast.SocketItem[] = [];
  while (true) {
    const { innerAttributes, outerAttributes } = collectAttributes(parser);
    attributes.push(...innerAttributes);
    const item = acceptSocketItem(parser);
    if (!item) {
      if (outerAttributes.length > 0) throw new SyntaxError(parser, ["}"]);
      break;
    }
    item.attributes.push(...outerAttributes);
    items.push(item);
  }
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Socket",
    attributes,
    keyword,
    name,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptSocketItem(parser: Parser): ast.SocketItem | undefined {
  const sender = acceptIdent(parser);
  if (!sender) return;
  skipWsAndComments(parser);
  const arrow = parser.expect("->", [], [identPattern]);
  skipWsAndComments(parser);
  const receiver = expectIdent(parser);
  skipWsAndComments(parser);
  const colon = parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const messageType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return {
    attributes: [],
    sender,
    arrow,
    receiver,
    colon,
    messageType,
    comma,
  };
}

function acceptTypeExpression(parser: Parser): ast.TypeExpression | undefined {
  const valueType = acceptIdent(parser);
  if (!valueType) return;
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("[");
  const container =
    bracketOpen &&
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
  const id = expectIdent(parser);
  skipWsAndComments(parser);
  const content = accept(/^(?:(?:\x20|\t|\r)*\|[^\n]*(?:\n|$))+/)(parser);
  return {
    type: "Attribute",
    symbol,
    id,
    content,
  };
}

const acceptPath = flipFlop<ast.Identifier, ast.Dot>(
  acceptIdentTyped,
  acceptDotTyped,
  skipWsAndComments
);

function expectPath(parser: Parser): ast.PathItem[] {
  const path = acceptPath(parser);
  if (path.length < 1) throw new SyntaxError(parser, [identPattern]);
  return path;
}
