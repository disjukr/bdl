import { Attribute } from "./attribute";
import { StringLiteral } from "./expression";
import { Comma, Dot, Identifier, Span } from "./token";

export * from "./attribute";
export * from "./expression";
export * from "./token";

export interface Bdl {
  attributes: Attribute[];
  statements: ModuleLevelStatement[];
}

export type ModuleLevelStatement =
  | Enum
  | Import
  | Rpc
  | Scalar
  | Socket
  | Struct
  | Union;

export type Path = (Identifier | Dot)[];

export interface Import {
  type: "import";
  attributes: Attribute[];
  keyword: Span;
  path: Path;
  bracketOpen: Span;
  items: ImportItem[];
  bracketClose: Span;
}

export interface ImportItem {
  name: Span;
  comma?: Comma;
}

export interface Scalar {
  type: "scalar";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  eq: Span;
  scalarType: Identifier;
}

export interface Enum {
  type: "enum";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: EnumItem[];
  bracketClose: Span;
}

export interface EnumItem {
  attributes: Attribute[];
  name: Span;
  eq: Span;
  value: StringLiteral;
  comma?: Comma;
}

export interface Union {
  type: "union";
  attributes: Attribute[];
  keyword: Span;
  discriminatorKey?: StringLiteral;
  name: Span;
  bracketOpen: Span;
  items: UnionItem[];
  bracketClose: Span;
}

export interface UnionItem {
  attributes: Attribute[];
  jsonKey?: StringLiteral;
  name: Span;
  struct?: UnionItemStruct;
  comma?: Comma;
}

export interface UnionItemStruct {
  bracketOpen: Span;
  fields: StructField[];
  bracketClose: Span;
}

export interface Struct {
  type: "struct";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  fields: StructField[];
  bracketClose: Span;
}

export interface StructField {
  attributes: Attribute[];
  name: Span;
  exclamation?: Span;
  question?: Span;
  colon: Span;
  itemType: TypeExpression;
  comma?: Comma;
}

export interface Rpc {
  type: "rpc";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: RpcItem[];
  bracketClose: Span;
}

export interface RpcItem {
  attributes: Attribute[];
  keywordStream?: Span;
  name: Span;
  bracketOpen: Span;
  inputFields: StructField[];
  bracketClose: Span;
  colon: Span;
  outputType: TypeExpression;
  error?: RpcItemError;
  comma?: Comma;
}

export interface RpcItemError {
  keywordThrows: Span;
  errorType: TypeExpression;
}

export interface Socket {
  type: "socket";
  attributes: Attribute[];
  keyword: Span;
  name: Span;
  bracketOpen: Span;
  items: SocketItem[];
  bracketClose: Span;
}

export interface SocketItem {
  attributes: Attribute[];
  sender: Identifier;
  arrow: Span;
  receiver: Identifier;
  colon: Span;
  messageType: TypeExpression;
  comma?: Comma;
}

export interface TypeExpression {
  valueType: Identifier;
  container?: Container;
}

export interface Container {
  bracketOpen: Span;
  keyType?: Identifier;
  bracketClose: Span;
}
