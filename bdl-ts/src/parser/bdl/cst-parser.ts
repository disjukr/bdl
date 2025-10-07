import type * as cst from "../../generated/cst.ts";
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

const topLevelKeywords = [
  "custom",
  "enum",
  "import",
  "oneof",
  "proc",
  "struct",
  "union",
];

export default function parseBdlCst(text: string): cst.BdlCst {
  const parser = new Parser(text);
  const offsetEncoding: cst.OffsetEncoding = "UTF16_CODE_UNIT";
  const statements: cst.ModuleLevelStatement[] = [];
  while (true) {
    if (parser.accept(eof)) break;
    const statement = acceptModuleLevelStatement(parser);
    if (!statement) {
      throw new SyntaxError(parser, topLevelKeywords, [identPattern]);
    }
    statements.push(statement);
  }
  return { offsetEncoding, statements };
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

const acceptModuleLevelStatement = choice<cst.ModuleLevelStatement>([
  skipWsAndComments,
  acceptAttribute,
  acceptCustom,
  acceptEnum,
  acceptImport,
  acceptOneof,
  acceptProc,
  acceptStruct,
  acceptUnion,
]);

const acceptEnumBlockStatement = choice<cst.EnumBlockStatement>([
  skipWsAndComments,
  acceptAttribute,
  acceptEnumItem,
]);

const acceptOneofBlockStatement = choice<cst.OneofBlockStatement>([
  skipWsAndComments,
  acceptAttribute,
  acceptOneofItem,
]);

const acceptStructBlockStatement = choice<cst.StructBlockStatement>([
  skipWsAndComments,
  acceptAttribute,
  acceptStructField,
]);

const acceptUnionBlockStatement = choice<cst.UnionBlockStatement>([
  skipWsAndComments,
  acceptAttribute,
  acceptUnionItem,
]);

function acceptImport(parser: Parser): cst.Import | undefined {
  const keyword = parser.accept(/^import\b/);
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
    keyword,
    path,
    bracketOpen,
    items,
    bracketClose,
  };
}

function acceptImportItem(parser: Parser): cst.ImportItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const alias = acceptImportAlias(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { name, alias, comma };
}

function acceptImportAlias(parser: Parser): cst.ImportAlias | undefined {
  const as = parser.accept(/^as\b/);
  if (!as) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  return { as, name };
}

function acceptCustom(parser: Parser): cst.Custom | undefined {
  const keyword = parser.accept(/^custom\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const eq = parser.expect("=", [], [identPattern]);
  skipWsAndComments(parser);
  const originalType = expectTypeExpression(parser);
  return {
    type: "Custom",
    keyword,
    name,
    eq,
    originalType,
  };
}

function acceptEnum(parser: Parser): cst.Enum | undefined {
  const keyword = parser.accept(/^enum\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const statements = zeroOrMore(acceptEnumBlockStatement)(parser);
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Enum",
    keyword,
    name,
    bracketOpen,
    statements,
    bracketClose,
  };
}

function acceptEnumItem(parser: Parser): cst.EnumItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { type: "EnumItem", name, comma };
}

function acceptOneof(parser: Parser): cst.Oneof | undefined {
  const keyword = parser.accept(/^oneof\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const statements = zeroOrMore(acceptOneofBlockStatement)(parser);
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Oneof",
    keyword,
    name,
    bracketOpen,
    statements,
    bracketClose,
  };
}

function acceptOneofItem(parser: Parser): cst.OneofItem | undefined {
  const itemType = acceptTypeExpression(parser);
  if (!itemType) return;
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { type: "OneofItem", itemType, comma };
}

function acceptUnion(parser: Parser): cst.Union | undefined {
  const keyword = parser.accept(/^union\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const statements = zeroOrMore(acceptUnionBlockStatement)(parser);
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Union",
    keyword,
    name,
    bracketOpen,
    statements,
    bracketClose,
  };
}

function acceptUnionItem(parser: Parser): cst.UnionItem | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const bracketOpen = parser.accept("(");
  const struct = bracketOpen &&
    (() => {
      const statements = zeroOrMore(acceptStructBlockStatement)(parser);
      const bracketClose = parser.expect(")", [], [identPattern]);
      return { bracketOpen, statements, bracketClose };
    })();
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return { type: "UnionItem", name, struct, comma };
}

function acceptStruct(parser: Parser): cst.Struct | undefined {
  const keyword = parser.accept(/^struct\b/);
  if (!keyword) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const bracketOpen = parser.expect("{", [], [identPattern]);
  const statements = zeroOrMore(acceptStructBlockStatement)(parser);
  const bracketClose = parser.expect("}", [], [identPattern]);
  return {
    type: "Struct",
    keyword,
    name,
    bracketOpen,
    statements,
    bracketClose,
  };
}

function acceptStructField(parser: Parser): cst.StructField | undefined {
  const name = acceptIdent(parser);
  if (!name) return;
  skipWsAndComments(parser);
  const question = parser.accept("?");
  skipWsAndComments(parser);
  const colon = parser.expect(":", [], [identPattern]);
  skipWsAndComments(parser);
  const fieldType = expectTypeExpression(parser);
  skipWsAndComments(parser);
  const comma = acceptComma(parser);
  return {
    type: "StructField",
    name,
    question,
    colon,
    fieldType,
    comma,
  };
}

function acceptProc(parser: Parser): cst.Proc | undefined {
  const keyword = parser.accept(/^proc\b/);
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
  const keywordThrows = parser.accept(/^throws\b/);
  const error = keywordThrows &&
    (() => {
      skipWsAndComments(parser);
      const errorType = expectTypeExpression(parser);
      return { keywordThrows, errorType };
    })();
  return {
    type: "Proc",
    keyword,
    name,
    eq,
    inputType,
    arrow,
    outputType,
    error,
  };
}

function acceptTypeExpression(parser: Parser): cst.TypeExpression | undefined {
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

function expectTypeExpression(parser: Parser): cst.TypeExpression {
  const type = acceptTypeExpression(parser);
  if (!type) throw new SyntaxError(parser, [identPattern]);
  return type;
}

function acceptAttribute(parser: Parser): cst.Attribute | undefined {
  const symbol = choice<cst.AttributeSymbol>([
    acceptTyped("Sharp", "#"),
    acceptTyped("At", "@"),
  ])(parser);
  if (!symbol) return;
  skipWsAndComments(parser);
  const name = expectIdent(parser);
  skipWsAndComments(parser);
  const content = parser.accept(attributeContentPattern);
  return {
    type: "Attribute",
    symbol,
    name,
    content,
  };
}

const acceptPath = flipFlop<cst.Identifier, cst.Dot>(
  acceptIdentTyped,
  acceptDotTyped,
  skipWsAndComments,
);

function expectPath(parser: Parser): cst.PathItem[] {
  const path = acceptPath(parser);
  if (path.length < 1) throw new SyntaxError(parser, [identPattern]);
  return path;
}
