from typing import List, Optional, Pattern, TypeVar, Union, Callable, Any
from dataclasses import dataclass


@dataclass
class Span:
    start: int
    end: int


@dataclass
class ColRow:
    col: int
    row: int


# Symbol to represent end of file
EOF = object()

# Pattern can be a string, regex pattern, or EOF symbol
PatternType = Union[str, Pattern, type(EOF)]
T = TypeVar("T")
AcceptFn = Callable[["Parser"], Optional[T]]
ExpectFn = Callable[["Parser"], T]


class SyntaxError(Exception):
    def __init__(
        self,
        parser: "Parser",
        expected_patterns: List[PatternType] = None,
        mistake_patterns: List[PatternType] = None,
    ):
        self.parser = parser
        self.loc = parser.loc
        self.expected_patterns = expected_patterns or []
        self.mistake_patterns = mistake_patterns or []

        message = f"Syntax error at position {self.loc}"
        col_row = self.col_row
        if col_row:
            message += f" (line {col_row.row + 1}, column {col_row.col + 1})"

        if self.expected_patterns:
            patterns_str = ", ".join(
                self._pattern_to_string(p) for p in self.expected_patterns
            )
            message += f"\nExpected: {patterns_str}"

        message += f"\n\n{self.parser.get_around_text(self.loc)}"
        super().__init__(message)

    @property
    def col_row(self) -> ColRow:
        return offset_to_col_row(self.parser.lines, self.parser.loc)

    @staticmethod
    def _pattern_to_string(pattern: PatternType) -> str:
        if pattern is EOF:
            return "<EOF>"
        if isinstance(pattern, str):
            return f'"{pattern}"'
        return str(pattern)


class Parser:
    def __init__(self, input_text: str, loc: int = 0):
        self.input = input_text
        self.loc = loc
        self._lines = input_text.split("\n")
        self._cnt = 0

    @property
    def lines(self) -> List[str]:
        return self._lines

    def look(self, accept_fn: AcceptFn[T]) -> Optional[T]:
        loc = self.loc
        try:
            return accept_fn(self)
        finally:
            self.loc = loc

    def accept(self, pattern: PatternType) -> Optional[Span]:
        self._cnt += 1
        if self._cnt > len(self.input) * 5:
            raise RuntimeError("Infinite loop detected")

        if pattern is EOF:
            return self._accept_eof()
        if isinstance(pattern, str):
            return self._accept_string(pattern)
        return self._accept_regex(pattern)

    def _accept_eof(self) -> Optional[Span]:
        if self.loc < len(self.input):
            return None
        return Span(start=self.loc, end=self.loc)

    def _accept_string(self, pattern: str) -> Optional[Span]:
        start = self.loc
        end = start + len(pattern)
        if end > len(self.input):
            return None
        text = self.input[start:end]
        if text != pattern:
            return None
        self.loc = end
        return Span(start=start, end=end)

    def _accept_regex(self, pattern: Pattern) -> Optional[Span]:
        match = pattern.search(self.input[self.loc :])
        if not match or match.start() != 0:
            return None

        text = match.group(0)
        start = self.loc
        end = start + len(text)
        self.loc = end
        return Span(start=start, end=end)

    def expect(
        self,
        accept_pattern: PatternType,
        expected_patterns: List[PatternType] = None,
        mistake_patterns: List[PatternType] = None,
    ) -> Span:
        result = self.accept(accept_pattern)
        _expected_patterns = [accept_pattern]
        if expected_patterns:
            _expected_patterns.extend(expected_patterns)

        if result is None:
            raise SyntaxError(self, _expected_patterns, mistake_patterns)
        return result

    def get_text(self, span: Span) -> str:
        return self.input[span.start : span.end]

    def get_around_text(self, loc: int = None, length: int = 1, window: int = 5) -> str:
        if loc is None:
            loc = self.loc

        col_row = offset_to_col_row(self._lines, loc)
        head_count = min(1, (window >> 1) + (window % 2))
        tail_count = window >> 1

        head_start = max(0, col_row.row - head_count)
        head_end = col_row.row + 1
        tail_start = col_row.row + 1
        tail_end = min(len(self._lines), col_row.row + tail_count + 1)

        heads = self._lines[head_start:head_end]
        tails = self._lines[tail_start:tail_end]

        line_number_digit_count = len(str(tail_end))

        head_texts = []
        for index, line in enumerate(heads):
            line_number = index + head_start + 1
            line_number_text = str(line_number).rjust(line_number_digit_count)
            head_texts.append(f"{line_number_text} | {line}")

        pointer_line = (
            " " * (line_number_digit_count + 3) + " " * col_row.col + "^" * length
        )

        tail_texts = []
        for index, line in enumerate(tails):
            line_number = index + tail_start + 1
            line_number_text = str(line_number).rjust(line_number_digit_count)
            tail_texts.append(f"{line_number_text} | {line}")

        return "\n".join([*head_texts, pointer_line, *tail_texts])


def offset_to_col_row(lines: List[str], offset: int) -> ColRow:
    row = 0
    col = 0

    for i, line in enumerate(lines):
        if offset <= len(line):
            row = i
            col = offset
            break
        offset -= len(line) + 1  # +1 for the newline

    return ColRow(col=col, row=row)


def col_row_to_offset(lines: List[str], col_row: ColRow) -> int:
    offset = 0
    for i in range(col_row.row):
        offset += len(lines[i]) + 1  # +1 for the newline
    return offset + col_row.col


def zero_or_more(accept_fn: AcceptFn[T]) -> ExpectFn[List[T]]:
    def parse(parser: Parser) -> List[T]:
        results = []
        while True:
            result = accept_fn(parser)
            if result is None:
                break
            results.append(result)
        return results

    return parse


def flip_flop(
    flip_fn: AcceptFn[T], flop_fn: AcceptFn[Any], skip_ws_fn: AcceptFn[None] = None
) -> ExpectFn[List[T]]:
    def parse(parser: Parser) -> List[T]:
        results = []

        # First element
        result = flip_fn(parser)
        if result is None:
            return results
        results.append(result)

        while True:
            if skip_ws_fn:
                skip_ws_fn(parser)

            # Separator
            sep = flop_fn(parser)
            if sep is None:
                break

            if skip_ws_fn:
                skip_ws_fn(parser)

            # Next element
            result = flip_fn(parser)
            if result is None:
                break
            results.append(result)

        return results

    return parse


def choice(accept_fns: List[AcceptFn[T]]) -> AcceptFn[T]:
    def parse(parser: Parser) -> Optional[T]:
        for fn in accept_fns:
            result = parser.look(fn)
            if result is not None:
                return fn(parser)
        return None

    return parse
