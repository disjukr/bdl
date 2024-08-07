// https://doc.rust-lang.org/reference/attributes.html
// BDL uses subset of Meta Item Attribute Syntax only.

import { Comma, Span } from "./token";
import { Expression } from "./expression";

export interface Attribute {
  type: "attribute";
  attributeType: "inner" | "outer";
  bracketOpen: Span;
  metaItem: MetaItem;
  bracketClose: Span;
}

export type MetaItem = MetaWord | MetaNameValue | MetaList;

export type MetaItemInner = MetaItem | MetaExpression;

export interface MetaWord extends Span {
  type: "word";
}

export interface MetaNameValue {
  type: "name-value";
  name: Span;
  eq: Span;
  value: Expression;
}

export interface MetaList {
  type: "list";
  name: Span;
  bracketOpen: Span;
  values: (MetaItemInner | Comma)[];
  bracketClose: Span;
}

export interface MetaExpression {
  type: "expression";
  expression: Expression;
}
