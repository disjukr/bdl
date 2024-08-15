struct Span {
  start: number,
  end: number,
}

struct Attribute {
  symbol: AttributeSymbol,
  name: Span,
  content?: Span,
}

struct JclAst {
  attributes: Attribute[],
  statements: ModuleLevelStatement[],
}

union ModuleLevelStatement {
  Enum(
    attributes: Attribute[],
    keyword: Span,
    name: Span,
    bracketOpen: Span,
    items: EnumItem[],
    bracketClose: Span,
  ),
  Import(
    attributes: Attribute[],
    keyword: Span,
    path: PathItem[],
    bracketOpen: Span,
    items: ImportItem[],
    bracketClose: Span,
  ),
  Rpc(
    attributes: Attribute[],
    keyword: Span,
    name: Span,
    bracketOpen: Span,
    items: RpcItem[],
    bracketClose: Span,
  ),
  Scalar(
    attributes: Attribute[],
    keyword: Span,
    name: Span,
    eq: Span,
    scalarType: TypeExpression,
  ),
  Socket(
    attributes: Attribute[],
    keyword: Span,
    name: Span,
    bracketOpen: Span,
    items: SocketItem[],
    bracketClose: Span,
  ),
  Struct(
    attributes: Attribute[],
    keyword: Span,
    name: Span,
    bracketOpen: Span,
    fields: StructField[],
    bracketClose: Span,
  ),
  Union(
    attributes: Attribute[],
    keyword: Span,
    discriminatorKey?: Span,
    name: Span,
    bracketOpen: Span,
    items: UnionItem[],
    bracketClose: Span,
  ),
}

union AttributeSymbol {
  Sharp(
    start: number,
    end: number,
  ),
  At(
    start: number,
    end: number,
  ),
}

struct EnumItem {
  attributes: Attribute[],
  name: Span,
  eq: Span,
  value: Span,
  comma?: Span,
}

struct ImportItem {
  name: Span,
  alias?: ImportAlias,
  comma?: Span,
}

struct ImportAlias {
  as: Span,
  name: Span,
}

union PathItem {
  Identifier(
    start: number,
    end: number,
  ),
  Dot(
    start: number,
    end: number,
  ),
}

struct RpcItem {
  attributes: Attribute[],
  keywordStream?: Span,
  name: Span,
  bracketOpen: Span,
  inputFields: StructField[],
  bracketClose: Span,
  colon: Span,
  outputType: TypeExpression,
  error?: RpcItemError,
  comma?: Span,
}

struct RpcItemError {
  keywordThrows: Span,
  errorType: TypeExpression,
}

struct SocketItem {
  attributes: Attribute[],
  sender: Span,
  arrow: Span,
  receiver: Span,
  colon: Span,
  messageType: TypeExpression,
  comma?: Span,
}

struct StructField {
  attributes: Attribute[],
  name: Span,
  nullPolicySymbol?: NullPolicySymbol,
  colon: Span,
  itemType: TypeExpression,
  comma?: Span,
}

union NullPolicySymbol {
  Exclamation(
    start: number,
    end: number,
  ),
  Question(
    start: number,
    end: number,
  ),
}

struct TypeExpression {
  valueType: Span,
  container?: Container,
}

struct Container {
  bracketOpen: Span,
  keyType?: Span,
  bracketClose: Span,
}

struct UnionItem {
  attributes: Attribute[],
  jsonKey?: Span,
  name: Span,
  struct?: UnionItemStruct,
  comma?: Span,
}

struct UnionItemStruct {
  bracketOpen: Span,
  fields: StructField[],
  bracketClose: Span,
}
