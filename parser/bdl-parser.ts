import * as ast from "../ast/bdl";
import {
  Parser,
  SyntaxError,
  accept,
  acceptTyped,
  choice,
  eof,
  expectTyped,
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

export default function parseBdl(text: string): ast.Bdl {
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

const whitespacePattern = /^\s+/;
const singlelineCommentPattern = /^\/\/.*(?:\n|$)/;
const stringLiteralPattern = /^"(?:\\x[0-9a-f]{2}|\\[nrtv\\"]|[^"\n\\])*"/i;
const identPattern = /^[a-z_][a-z0-9_]*/i;

const acceptStringLiteral = acceptTyped("string-literal", stringLiteralPattern);
const expectStringLiteral = expectTyped("string-literal", stringLiteralPattern);
const acceptIdent = acceptTyped("identifier", identPattern);
const expectIdent = expectTyped("identifier", identPattern);
const acceptComma = acceptTyped("comma", ",");
const acceptDot = acceptTyped("dot", ".");

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
    type: "import",
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
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { name, comma };
}

function acceptScalar(parser: Parser): ast.Scalar | undefined {
  const keyword = parser.accept("scalar");
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const eq = parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const scalarType = expectIdent(parser);
  return {
    type: "scalar",
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
    type: "enum",
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
    type: "union",
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
    type: "struct",
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
  const { exclamation, question } = (() => {
    const op = choice([accept("!"), accept("?")])(parser);
    if (op && parser.getText(op) === "!") {
      return { exclamation: op, question: undefined };
    } else {
      return { exclamation: undefined, question: undefined };
    }
  })();
  skipWsAndComments(parser);
  const colon = parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const itemType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return {
    attributes: [],
    name,
    exclamation,
    question,
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
    type: "rpc",
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
    type: "socket",
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
    if (attribute.attributeType === "inner") {
      result.innerAttributes.push(attribute);
    } else {
      result.outerAttributes.push(attribute);
    }
  }
  return result;
}

function acceptAttribute(parser: Parser): ast.Attribute | undefined {
  const bracketOpen = choice([accept("#!["), accept("#[")])(parser);
  if (!bracketOpen) return;
  const attributeType =
    parser.getText(bracketOpen) === "#![" ? "inner" : "outer";
  skipWsAndComments(parser);
  const metaItem = acceptMetaItem(parser);
  if (!metaItem) throw new SyntaxError(parser, [identPattern]);
  skipWsAndComments(parser);
  const bracketClose = parser.accept("]");
  if (!bracketClose) throw new SyntaxError(parser, ["]"]);
  return {
    type: "attribute",
    attributeType,
    bracketOpen,
    metaItem,
    bracketClose,
  };
}

function acceptMetaItem(parser: Parser): ast.MetaItem | undefined {
  return choice([acceptMetaList, acceptMetaNameValue, acceptMetaWord])(parser);
}

function acceptMetaList(parser: Parser): ast.MetaList | undefined {
  const loc = parser.loc;
  const name = parser.accept(identPattern);
  if (!name) return;
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("(");
  if (!bracketOpen) {
    parser.loc = loc;
    return;
  }
  skipWsAndComments(parser);
  const values = flipFlop<ast.MetaItemInner, ast.Comma>(
    acceptMetaItemInner,
    acceptComma,
    skipWsAndComments
  )(parser);
  const bracketClose = parser.expect(")", [], [identPattern]);
  return {
    type: "list",
    name,
    bracketOpen,
    values,
    bracketClose,
  };
}

function acceptMetaNameValue(parser: Parser): ast.MetaItem | undefined {
  const loc = parser.loc;
  const name = parser.accept(identPattern);
  if (!name) return;
  skipWsAndComments(parser);
  const eq = parser.accept("=");
  if (!eq) {
    parser.loc = loc;
    return;
  }
  skipWsAndComments(parser);
  const value = expectExpression(parser);
  return {
    type: "name-value",
    name,
    eq,
    value,
  };
}

const acceptMetaWord = acceptTyped("word", identPattern);

function acceptMetaItemInner(parser: Parser): ast.MetaItemInner | undefined {
  return choice<ast.MetaItemInner>([acceptMetaItem, acceptMetaExpression])(
    parser
  );
}

function acceptMetaExpression(parser: Parser): ast.MetaExpression | undefined {
  const expression = acceptExpression(parser);
  if (!expression) return;
  return {
    type: "expression",
    expression,
  };
}

function expectExpression(parser: Parser): ast.Expression {
  const expression = acceptExpression(parser);
  if (!expression) throw new SyntaxError(parser, [stringLiteralPattern]);
  return expression;
}

function acceptExpression(parser: Parser): ast.Expression | undefined {
  return acceptStringLiteral(parser);
}

const acceptPath = flipFlop<ast.Identifier, ast.Dot>(
  acceptIdent,
  acceptDot,
  skipWsAndComments
);

function expectPath(parser: Parser): ast.Path {
  const path = acceptPath(parser);
  if (path.length < 1) throw new SyntaxError(parser, [identPattern]);
  return path;
}
