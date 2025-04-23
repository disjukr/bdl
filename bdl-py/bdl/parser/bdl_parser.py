import re
from typing import Literal, List, Optional, Callable, Any
from dataclasses import dataclass, field

from .parser import Parser, Span, SyntaxError, EOF, flip_flop, choice


@dataclass
class Attribute:
    symbol: Literal["Sharp", "At"]
    name: Span
    content: Optional[Span] = None


@dataclass
class Sharp:
    type: str = "Sharp"
    span: Span = None


@dataclass
class At:
    type: str = "At"
    span: Span = None


@dataclass
class BdlAst:
    attributes: List[Attribute] = field(default_factory=list)
    statements: List["ModuleLevelStatement"] = field(default_factory=list)


@dataclass
class Import:
    type: str = "Import"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    path: List["PathItem"] = field(default_factory=list)
    bracket_open: Span = None
    items: List["ImportItem"] = field(default_factory=list)
    bracket_close: Span = None


@dataclass
class ImportItem:
    name: Span = None
    alias: Optional["ImportAlias"] = None
    comma: Optional[Span] = None


@dataclass
class ImportAlias:
    as_keyword: Span = None
    name: Span = None


@dataclass
class PathItem:
    pass


@dataclass
class Identifier(PathItem):
    type: str = "Identifier"
    span: Span = None


@dataclass
class Dot(PathItem):
    type: str = "Dot"
    span: Span = None


@dataclass
class TypeExpression:
    value_type: Span = None
    container: Optional["Container"] = None


@dataclass
class Container:
    bracket_open: Span = None
    key_type: Optional[Span] = None
    bracket_close: Span = None


@dataclass
class Custom:
    type: str = "Custom"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    name: Span = None
    eq: Span = None
    original_type: TypeExpression = None


@dataclass
class Enum:
    type: str = "Enum"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    name: Span = None
    bracket_open: Span = None
    items: List["EnumItem"] = field(default_factory=list)
    bracket_close: Span = None


@dataclass
class EnumItem:
    attributes: List[Attribute] = field(default_factory=list)
    name: Span = None
    comma: Optional[Span] = None


@dataclass
class Oneof:
    type: str = "Oneof"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    name: Span = None
    bracket_open: Span = None
    items: List["OneofItem"] = field(default_factory=list)
    bracket_close: Span = None


@dataclass
class OneofItem:
    attributes: List[Attribute] = field(default_factory=list)
    item_type: TypeExpression = None
    comma: Optional[Span] = None


@dataclass
class Proc:
    type: str = "Proc"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    name: Span = None
    eq: Span = None
    input_type: TypeExpression = None
    arrow: Span = None
    output_type: TypeExpression = None
    error: Optional["ThrowsError"] = None


@dataclass
class ThrowsError:
    keyword_throws: Span = None
    error_type: TypeExpression = None


@dataclass
class Struct:
    type: str = "Struct"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    name: Span = None
    bracket_open: Span = None
    fields: List["StructField"] = field(default_factory=list)
    bracket_close: Span = None


@dataclass
class StructField:
    attributes: List[Attribute] = field(default_factory=list)
    name: Span = None
    question: Optional[Span] = None
    colon: Span = None
    field_type: TypeExpression = None
    comma: Optional[Span] = None


@dataclass
class Union:
    type: str = "Union"
    attributes: List[Attribute] = field(default_factory=list)
    keyword: Span = None
    name: Span = None
    bracket_open: Span = None
    items: List["UnionItem"] = field(default_factory=list)
    bracket_close: Span = None


@dataclass
class UnionItem:
    attributes: List[Attribute] = field(default_factory=list)
    name: Span = None
    struct: Optional["UnionItemStruct"] = None
    comma: Optional[Span] = None


@dataclass
class UnionItemStruct:
    bracket_open: Span = None
    fields: List[StructField] = field(default_factory=list)
    bracket_close: Span = None


ModuleLevelStatement = Custom | Enum | Import | Oneof | Proc | Struct | Union


@dataclass
class CollectAttributesResult:
    inner_attributes: List[Attribute]
    outer_attributes: List[Attribute]


IDENT_PATTERN = re.compile(r"^[a-z_][a-z0-9_]*", re.IGNORECASE)
WHITESPACE_PATTERN = re.compile(r"^(?:\x20|\t|\r|\n)+")
SINGLELINE_COMMENT_PATTERN = re.compile(r"^//.*(?:\n|$)")
ATTRIBUTE_CONTENT_PATTERN = re.compile(
    r"^- ?[^\n]*|^(?:(?:\x20|\t|\r)*\|[^\n]*(?:\n|$))+"
)

TOP_LEVEL_KEYWORDS = ["custom", "enum", "import", "oneof", "proc", "struct", "union"]


def parse_bdl(text: str) -> BdlAst:
    parser = Parser(text)
    attributes = []
    statements = []

    while True:
        attrs = collect_attributes(parser)
        attributes.extend(attrs.inner_attributes)

        if parser.accept(EOF):
            if attrs.outer_attributes:
                raise SyntaxError(parser, TOP_LEVEL_KEYWORDS)
            break

        statement = accept_statement(parser)
        if statement is None:
            raise SyntaxError(parser, TOP_LEVEL_KEYWORDS, [IDENT_PATTERN])

        statement.attributes.extend(attrs.outer_attributes)
        statements.append(statement)

    return BdlAst(attributes=attributes, statements=statements)


def skip_ws_and_comments(parser: Parser) -> None:
    while True:
        if parser.accept(WHITESPACE_PATTERN) is not None:
            continue
        if parser.accept(SINGLELINE_COMMENT_PATTERN) is not None:
            continue
        break


def accept_comma(parser: Parser) -> Optional[Span]:
    return parser.accept(",")


def accept_ident(parser: Parser) -> Optional[Span]:
    return parser.accept(IDENT_PATTERN)


def expect_ident(parser: Parser) -> Span:
    result = accept_ident(parser)
    if result is None:
        raise SyntaxError(parser, [IDENT_PATTERN])
    return result


def accept_identifier_typed(parser: Parser) -> Optional[Identifier]:
    span = accept_ident(parser)
    if span is None:
        return None
    return Identifier(span=span)


def accept_dot_typed(parser: Parser) -> Optional[Dot]:
    span = parser.accept(".")
    if span is None:
        return None
    return Dot(span=span)


def accept_typed(type_name: str, pattern) -> Callable[[Parser], Optional[Any]]:
    def accept(parser: Parser) -> Optional[Any]:
        span = parser.accept(pattern)
        if span is None:
            return None
        return {"Sharp": Sharp, "At": At}.get(type_name, lambda: None)(span=span)

    return accept


def accept_statement(parser: Parser) -> Optional[ModuleLevelStatement]:
    return choice(
        [
            accept_custom,
            accept_enum,
            accept_import,
            accept_oneof,
            accept_proc,
            accept_struct,
            accept_union,
        ]
    )(parser)


def accept_import(parser: Parser) -> Optional[Import]:
    keyword = parser.accept(re.compile(r"^\bimport\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    path = expect_path(parser)
    skip_ws_and_comments(parser)
    bracket_open = parser.expect("{", [], [IDENT_PATTERN])

    items = []
    while True:
        skip_ws_and_comments(parser)
        item = accept_import_item(parser)
        if item is None:
            break
        items.append(item)

    bracket_close = parser.expect("}", [], [IDENT_PATTERN])

    return Import(
        keyword=keyword,
        path=path,
        bracket_open=bracket_open,
        items=items,
        bracket_close=bracket_close,
    )


def accept_import_item(parser: Parser) -> Optional[ImportItem]:
    name = accept_ident(parser)
    if name is None:
        return None

    skip_ws_and_comments(parser)
    alias = accept_import_alias(parser)
    skip_ws_and_comments(parser)
    comma = accept_comma(parser)

    return ImportItem(name=name, alias=alias, comma=comma)


def accept_import_alias(parser: Parser) -> Optional[ImportAlias]:
    as_keyword = parser.accept(re.compile(r"^\bas\b"))
    if as_keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)

    return ImportAlias(as_keyword=as_keyword, name=name)


def accept_custom(parser: Parser) -> Optional[Custom]:
    keyword = parser.accept(re.compile(r"^\bcustom\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    eq = parser.expect("=", [], [IDENT_PATTERN])
    skip_ws_and_comments(parser)
    original_type = expect_type_expression(parser)

    return Custom(keyword=keyword, name=name, eq=eq, original_type=original_type)


def accept_enum(parser: Parser) -> Optional[Enum]:
    keyword = parser.accept(re.compile(r"^\benum\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    bracket_open = parser.expect("{", [], [IDENT_PATTERN])

    attributes = []
    items = []

    while True:
        attrs = collect_attributes(parser)
        attributes.extend(attrs.inner_attributes)

        item = accept_enum_item(parser)
        if item is None:
            if attrs.outer_attributes:
                raise SyntaxError(parser, ["}"])
            break

        item.attributes.extend(attrs.outer_attributes)
        items.append(item)

    bracket_close = parser.expect("}", [], [IDENT_PATTERN])

    return Enum(
        attributes=attributes,
        keyword=keyword,
        name=name,
        bracket_open=bracket_open,
        items=items,
        bracket_close=bracket_close,
    )


def accept_enum_item(parser: Parser) -> Optional[EnumItem]:
    name = accept_ident(parser)
    if name is None:
        return None

    skip_ws_and_comments(parser)
    comma = accept_comma(parser)

    return EnumItem(name=name, comma=comma)


def accept_oneof(parser: Parser) -> Optional[Oneof]:
    keyword = parser.accept(re.compile(r"^\boneof\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    bracket_open = parser.expect("{", [], [IDENT_PATTERN])

    attributes = []
    items = []

    while True:
        attrs = collect_attributes(parser)
        attributes.extend(attrs.inner_attributes)

        item = accept_oneof_item(parser)
        if item is None:
            if attrs.outer_attributes:
                raise SyntaxError(parser, ["}"])
            break

        item.attributes.extend(attrs.outer_attributes)
        items.append(item)

    bracket_close = parser.expect("}", [], [IDENT_PATTERN])

    return Oneof(
        attributes=attributes,
        keyword=keyword,
        name=name,
        bracket_open=bracket_open,
        items=items,
        bracket_close=bracket_close,
    )


def accept_oneof_item(parser: Parser) -> Optional[OneofItem]:
    item_type = accept_type_expression(parser)
    if item_type is None:
        return None

    skip_ws_and_comments(parser)
    comma = accept_comma(parser)

    return OneofItem(item_type=item_type, comma=comma)


def accept_union(parser: Parser) -> Optional[Union]:
    keyword = parser.accept(re.compile(r"^\bunion\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    bracket_open = parser.expect("{", [], [IDENT_PATTERN])

    attributes = []
    items = []

    while True:
        attrs = collect_attributes(parser)
        attributes.extend(attrs.inner_attributes)

        item = accept_union_item(parser)
        if item is None:
            if attrs.outer_attributes:
                raise SyntaxError(parser, ["}"])
            break

        item.attributes.extend(attrs.outer_attributes)
        items.append(item)

    bracket_close = parser.expect("}", [], [IDENT_PATTERN])

    return Union(
        attributes=attributes,
        keyword=keyword,
        name=name,
        bracket_open=bracket_open,
        items=items,
        bracket_close=bracket_close,
    )


def accept_union_item(parser: Parser) -> Optional[UnionItem]:
    name = accept_ident(parser)
    if name is None:
        return None

    skip_ws_and_comments(parser)
    struct = None
    bracket_open = parser.accept("(")

    if bracket_open is not None:
        attributes = []
        fields = []

        while True:
            attrs = collect_attributes(parser)
            attributes.extend(attrs.inner_attributes)

            field = accept_struct_field(parser)
            if field is None:
                if attrs.outer_attributes:
                    raise SyntaxError(parser, [")"])
                break

            field.attributes.extend(attrs.outer_attributes)
            fields.append(field)

        bracket_close = parser.expect(")", [], [IDENT_PATTERN])

        struct = UnionItemStruct(
            bracket_open=bracket_open, fields=fields, bracket_close=bracket_close
        )

    skip_ws_and_comments(parser)
    comma = accept_comma(parser)

    return UnionItem(name=name, struct=struct, comma=comma)


def accept_struct(parser: Parser) -> Optional[Struct]:
    keyword = parser.accept(re.compile(r"^\bstruct\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    bracket_open = parser.expect("{", [], [IDENT_PATTERN])

    attributes = []
    fields = []

    while True:
        attrs = collect_attributes(parser)
        attributes.extend(attrs.inner_attributes)

        field = accept_struct_field(parser)
        if field is None:
            if attrs.outer_attributes:
                raise SyntaxError(parser, ["}"])
            break

        field.attributes.extend(attrs.outer_attributes)
        fields.append(field)

    bracket_close = parser.expect("}", [], [IDENT_PATTERN])

    return Struct(
        attributes=attributes,
        keyword=keyword,
        name=name,
        bracket_open=bracket_open,
        fields=fields,
        bracket_close=bracket_close,
    )


def accept_struct_field(parser: Parser) -> Optional[StructField]:
    name = accept_ident(parser)
    if name is None:
        return None

    skip_ws_and_comments(parser)
    question = parser.accept("?")
    skip_ws_and_comments(parser)
    colon = parser.expect(":", [], [IDENT_PATTERN])
    skip_ws_and_comments(parser)
    field_type = expect_type_expression(parser)
    skip_ws_and_comments(parser)
    comma = accept_comma(parser)

    return StructField(
        name=name, question=question, colon=colon, field_type=field_type, comma=comma
    )


def accept_proc(parser: Parser) -> Optional[Proc]:
    keyword = parser.accept(re.compile(r"^\bproc\b"))
    if keyword is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    eq = parser.expect("=", [], [IDENT_PATTERN])
    skip_ws_and_comments(parser)
    input_type = expect_type_expression(parser)
    skip_ws_and_comments(parser)
    arrow = parser.expect("->", [], [IDENT_PATTERN])
    skip_ws_and_comments(parser)
    output_type = expect_type_expression(parser)

    error = None
    skip_ws_and_comments(parser)
    keyword_throws = parser.accept(re.compile(r"^\bthrows\b"))

    if keyword_throws is not None:
        skip_ws_and_comments(parser)
        error_type = expect_type_expression(parser)
        error = ThrowsError(keyword_throws=keyword_throws, error_type=error_type)

    return Proc(
        keyword=keyword,
        name=name,
        eq=eq,
        input_type=input_type,
        arrow=arrow,
        output_type=output_type,
        error=error,
    )


def accept_type_expression(parser: Parser) -> Optional[TypeExpression]:
    value_type = accept_ident(parser)
    if value_type is None:
        return None

    skip_ws_and_comments(parser)
    container = None
    bracket_open = parser.accept("[")

    if bracket_open is not None:
        key_type = accept_ident(parser)
        bracket_close = parser.expect("]", [], [IDENT_PATTERN])

        container = Container(
            bracket_open=bracket_open, key_type=key_type, bracket_close=bracket_close
        )

    return TypeExpression(value_type=value_type, container=container)


def expect_type_expression(parser: Parser) -> TypeExpression:
    type_expr = accept_type_expression(parser)
    if type_expr is None:
        raise SyntaxError(parser, [IDENT_PATTERN])
    return type_expr


def collect_attributes(parser: Parser) -> CollectAttributesResult:
    inner_attributes = []
    outer_attributes = []

    while True:
        skip_ws_and_comments(parser)
        attribute = accept_attribute(parser)

        if attribute is None:
            break

        if attribute.symbol.type == "Sharp":
            inner_attributes.append(attribute)
        else:
            outer_attributes.append(attribute)

    return CollectAttributesResult(
        inner_attributes=inner_attributes, outer_attributes=outer_attributes
    )


def accept_attribute(parser: Parser) -> Optional[Attribute]:
    symbol = choice([accept_typed("Sharp", "#"), accept_typed("At", "@")])(parser)

    if symbol is None:
        return None

    skip_ws_and_comments(parser)
    name = expect_ident(parser)
    skip_ws_and_comments(parser)
    content = parser.accept(ATTRIBUTE_CONTENT_PATTERN)

    return Attribute(symbol=symbol, name=name, content=content)


accept_path = flip_flop(accept_identifier_typed, accept_dot_typed, skip_ws_and_comments)


def expect_path(parser: Parser) -> List[PathItem]:
    path = accept_path(parser)
    if not path:
        raise SyntaxError(parser, [IDENT_PATTERN])
    return path
