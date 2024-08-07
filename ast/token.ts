export interface Span {
  start: number;
  end: number;
}

export interface Identifier extends Span {
  type: "identifier";
}

export interface Comma extends Span {
  type: "comma";
}

export interface Dot extends Span {
  type: "dot";
}
