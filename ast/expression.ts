import { Span } from "./token";

export type Expression = StringLiteral;

export interface StringLiteral extends Span {
  type: "string-literal";
}
