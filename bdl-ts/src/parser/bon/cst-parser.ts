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
const acceptNanTyped = acceptTyped("NotANumber", /^NaN\b/);
const acceptNullTyped = acceptTyped("Null", /^null\b/);
const acceptBooleanTyped = acceptTyped("Boolean", /^(?:true|false)\b/);
const acceptJsonStringTyped = acceptTyped("String", /^"(?:\\.|[^"\\])*"/);

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

function expectBonValue(parser: Parser): bonCst.BonValue {
  const value = acceptBonValue(parser);
  if (!value) {
    throw new SyntaxError(parser, [identPattern, "{", "[", '"', "-", "+"], []);
  }
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

function acceptPrimitive(parser: Parser): bonCst.Primitive | undefined {
  const value = acceptPrimitiveValue(parser);
  if (!value) return;
  return { type: "Primitive", typeInfo: undefined, value };
}

const acceptPrimitiveValue = choice<bonCst.PrimitiveValue>([
  acceptNullTyped,
  acceptBooleanTyped,
  acceptIdentTyped,
  acceptNumeric,
  acceptJsonStringTyped,
]);

function acceptNumeric(
  parser: Parser,
): bonCst.Integer | bonCst.Float | undefined {
  const nan = acceptNanTyped(parser);
  if (nan) return { type: "Float", value: nan };
  const loc = parser.loc;
  const sign = parser.accept(/^[+-]/);
  const infinity = parser.accept(/^Infinity\b/);
  if (infinity) {
    return {
      type: "Float",
      value: { type: "Infinity", sign, value: infinity },
    };
  }
  const significand = parser.accept(/^(0|[1-9][0-9]*)/);
  if (!significand) {
    parser.loc = loc;
    return;
  }
  const fraction = acceptFraction(parser);
  const exponent = acceptExponent(parser);
  if (!fraction && !exponent) {
    return { type: "Integer", sign, value: significand };
  }
  return {
    type: "Float",
    value: { type: "Value", sign, significand, fraction, exponent },
  };
}

function acceptFraction(
  parser: Parser,
): bonCst.Fraction | undefined {
  const dot = parser.accept(/^\./);
  if (!dot) return;
  const value = parser.expect(/^[0-9]+/);
  return { dot, value };
}

function acceptExponent(
  parser: Parser,
): bonCst.Exponent | undefined {
  const marker = parser.accept(/^[eE]/);
  if (!marker) return;
  const sign = parser.accept(/^[+-]/);
  const value = parser.expect(/^[0-9]+/);
  return { marker, sign, value };
}
