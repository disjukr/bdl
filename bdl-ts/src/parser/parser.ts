export interface ColRow {
  col: number;
  row: number;
}

export interface Span {
  start: number;
  end: number;
}

export type Pattern = string | RegExp | typeof eof;

export const eof = Symbol("<EOF>");

export class Parser {
  #cnt = 0;
  #lines: string[];
  constructor(public readonly input: string, public loc = 0) {
    this.#lines = input.split("\n");
  }
  get lines() {
    return this.#lines;
  }
  look<T>(acceptFn: AcceptFn<T>): T | undefined {
    const loc = this.loc;
    try {
      return acceptFn(this);
    } finally {
      this.loc = loc;
    }
  }
  accept(pattern: Pattern): Span | undefined {
    this.#cnt++;
    if (this.#cnt > this.input.length * 5) throw "infinite loop detected";
    if (pattern === eof) return this.#acceptEof();
    if (typeof pattern === "string") return this.#acceptString(pattern);
    return this.#acceptRegex(pattern);
  }
  #acceptEof(): Span | undefined {
    if (this.loc < this.input.length) return;
    return { start: this.loc, end: this.loc };
  }
  #acceptString(pattern: string): Span | undefined {
    const start = this.loc;
    const end = start + pattern.length;
    const text = this.input.slice(start, end);
    if (text !== pattern) return;
    this.loc = end;
    return { start, end };
  }
  #acceptRegex(pattern: RegExp): Span | undefined {
    pattern.lastIndex = 0;
    const execArray = pattern.exec(this.input.slice(this.loc));
    if (execArray == null) return;
    const text = execArray[0];
    const start = this.loc + execArray.index;
    const end = start + text.length;
    this.loc = end;
    return { start, end };
  }
  expect(
    acceptPattern: Pattern,
    expectedPatterns?: Pattern[],
    mistakePatterns?: Pattern[],
  ): Span {
    const result = this.accept(acceptPattern);
    const _expectedPatterns: Pattern[] = expectedPatterns
      ? [acceptPattern, ...expectedPatterns]
      : [acceptPattern];
    if (result == null) {
      throw new SyntaxError(this, _expectedPatterns, mistakePatterns);
    } else {
      return result;
    }
  }
  getText({ start, end }: Span): string {
    return this.input.slice(start, end);
  }
  getAroundText(
    loc: number = this.loc,
    length: number = 1,
    window: number = 5,
  ) {
    const colRow = offsetToColRow(this.#lines, loc);
    const headCount = Math.min(1, (window >> 1) + (window % 2));
    const tailCount = window >> 1;
    const headStart = Math.max(0, colRow.row - headCount - 1);
    const headEnd = colRow.row + 1;
    const tailStart = colRow.row + 1;
    const tailEnd = colRow.row + tailCount + 1;
    const heads = this.#lines.slice(headStart, headEnd);
    const tails = this.#lines.slice(tailStart, tailEnd);
    const lineNumberDigitCount = tailEnd.toString().length;
    const headTexts = heads
      .map((line, index) => {
        const lineNumber = index + headStart + 1;
        const lineNumberText = lineNumber
          .toString()
          .padStart(lineNumberDigitCount + 1);
        return lineNumberText + " | " + line;
      })
      .join("\n");
    const tailTexts = tails
      .map((line, index) => {
        const lineNumber = index + tailStart + 1;
        const lineNumberText = lineNumber
          .toString()
          .padStart(lineNumberDigitCount + 1);
        return lineNumberText + " | " + line;
      })
      .join("\n");
    return [
      headTexts,
      new Array(lineNumberDigitCount + 1 + 1).join(" ") +
      " | " +
      new Array(colRow.col + 1).join(" ") +
      new Array(length + 1).join("^"),
      tailTexts,
    ].join("\n");
  }
}

export class SyntaxError extends Error {
  constructor(
    public parser: Parser,
    public expectedPatterns: Pattern[],
    public mistakePatterns: Pattern[] = [],
  ) {
    super();
    const colRow = this.colRow;
    const got = this.got;
    const length = got === eof ? 1 : got.length;
    const expectedPatternsText = expectedPatterns
      .map(patternToString)
      .join(" or ");
    this.message = `at line ${colRow.row + 1}, column ${colRow.col + 1}:\n\n` +
      `expected ${expectedPatternsText}, got ${patternToString(got)}\n\n` +
      parser.getAroundText(parser.loc, length);
  }
  get got() {
    const parser = this.parser;
    for (const mistakePattern of this.mistakePatterns) {
      const token = parser.look(accept(mistakePattern));
      if (token) return parser.getText(token);
    }
    return parser.input.charAt(parser.loc) || eof;
  }
  get colRow() {
    return offsetToColRow(this.parser.lines, this.parser.loc);
  }
}

export function patternToString(pattern: Pattern) {
  if (pattern === eof) return "<EOF>";
  if (typeof pattern === "string") return JSON.stringify(pattern);
  return pattern.toString();
}

export function offsetToColRow(lines: string[], offset: number) {
  let row = 0;
  let col = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (offset < line.length + 1) {
      row = i;
      col = offset;
      break;
    }
    offset -= line.length + 1;
  }
  return { col, row };
}

export function colRowToOffset(lines: string[], { col, row }: ColRow) {
  let offset = 0;
  for (let i = 0; i < row; i++) {
    offset += lines[i].length + 1;
  }
  return offset + col;
}

export interface AcceptFn<T> {
  (parser: Parser): T | undefined;
}

export interface ExpectFn<T> {
  (parser: Parser): T;
}

export function zeroOrMore<T>(acceptFn: AcceptFn<T>): ExpectFn<T[]> {
  return function accept(parser) {
    const nodes: T[] = [];
    let node: T | undefined;
    while ((node = acceptFn(parser))) nodes.push(node);
    return nodes;
  };
}

export function flipFlop<T, U>(
  flipFn: AcceptFn<T>,
  flopFn: AcceptFn<U>,
  skipWsFn?: AcceptFn<void>,
): ExpectFn<(T | U)[]> {
  return function accept(parser) {
    let flip = true;
    const fn: AcceptFn<T | U> = (parser) => {
      const result = flip ? flipFn(parser) : flopFn(parser);
      flip = !flip;
      skipWsFn?.(parser);
      return result;
    };
    const nodes: (T | U)[] = [];
    let node: T | U | undefined;
    if ((node = fn(parser))) nodes.push(node);
    while ((node = fn(parser))) nodes.push(node);
    return nodes;
  };
}

export function choice<T>(acceptFns: AcceptFn<T>[]): AcceptFn<T> {
  return function accept(parser) {
    for (const acceptFn of acceptFns) {
      const node = acceptFn(parser);
      if (node) return node;
    }
  };
}

const identPattern = /^[a-z_][a-z0-9_]*/i;

export function accept(pattern: Pattern = identPattern): AcceptFn<Span> {
  return function accept(parser) {
    return parser.accept(pattern);
  };
}

export function acceptTyped<TType extends string>(
  type: TType,
  pattern: Pattern = identPattern,
): AcceptFn<Span & { type: TType }> {
  return function accept(parser) {
    const token = parser.accept(pattern);
    if (!token) return;
    return { type, ...token };
  };
}

export function expect(
  acceptPattern: Pattern,
  expectedPatterns?: Pattern[],
  mistakePatterns?: Pattern[],
): ExpectFn<Span> {
  return function expect(parser) {
    return parser.expect(acceptPattern, expectedPatterns, mistakePatterns);
  };
}

export function expectTyped<TType extends string>(
  type: TType,
  acceptPattern: Pattern,
  expectedPatterns?: Pattern[],
  mistakePatterns?: Pattern[],
): ExpectFn<Span & { type: TType }> {
  return function expect(parser: Parser) {
    const token = parser.expect(
      acceptPattern,
      expectedPatterns,
      mistakePatterns,
    );
    return { type, ...token };
  };
}
