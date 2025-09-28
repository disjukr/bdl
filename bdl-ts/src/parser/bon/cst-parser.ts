import type * as bonCst from "../../generated/bon-cst.ts";
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

export default function parseBonCst(text: string): bonCst.BonCst {
  const parser = new Parser(text);
  const offsetEncoding: bonCst.OffsetEncoding = "UTF16_CODE_UNIT";
  skipWsAndComments(parser);
  const value: bonCst.BonValue = expectBonValue(parser);
  skipWsAndComments(parser);
  parser.expect(eof);
  return { offsetEncoding, value };
}

const identPattern = /^[a-z_][a-z0-9_]*\b/i;
const whitespacePattern = /^(?:\x20|\t|\r|\n)+/;
const singlelineCommentPattern = /^\/\/.*(?:\n|$)/;

const acceptComma = accept(",");
const acceptIdent = accept(identPattern);
const expectIdent = expect(identPattern);
const acceptIdentTyped = acceptTyped("Identifier", identPattern);
const acceptDotTyped = acceptTyped("Dot", ".");
const acceptNullTyped = acceptTyped("Null", /^null\b/);
const acceptBooleanTyped = acceptTyped("Boolean", /^(?:true|false)\b/);

function skipWsAndComments(parser: Parser): undefined {
  while (true) {
    const ws = parser.accept(whitespacePattern);
    if (ws) continue;
    const comment = parser.accept(singlelineCommentPattern);
    if (comment) continue;
    break;
  }
}

function acceptBonValue(parser: Parser): bonCst.BonValue | undefined {
  const loc = parser.loc;
  const typeInfo = acceptTypeInfo(parser);
  skipWsAndComments(parser);
  const value = acceptPrimitive(parser);
  if (!value) {
    parser.loc = loc;
    return;
  }
  value.typeInfo = typeInfo;
  return value;
}

function acceptTypeInfo(parser: Parser): bonCst.TypeInfo | undefined {
  const typePath = acceptPath(parser);
  if (!typePath) return;
  skipWsAndComments(parser);
  const colonColon = parser.expect("::");
  return { typePath, colonColon };
}

const acceptPath = flipFlop<bonCst.Identifier, bonCst.Dot>(
  acceptIdentTyped,
  acceptDotTyped,
  skipWsAndComments,
);

function acceptPrimitive(_parser: Parser): bonCst.Primitive | undefined {
  // TODO
  return {
    type: "Primitive",
    typeInfo: undefined,
    value: { type: "Null", start: 0, end: 0 },
  };
}

function expectBonValue(parser: Parser): bonCst.BonValue {
  const value = acceptBonValue(parser);
  if (!value) {
    throw new SyntaxError(parser, [identPattern, "{", "[", '"', "-", "+"], []);
  }
  return value;
}
