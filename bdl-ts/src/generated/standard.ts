export interface BdlStandard {
  name?: string;
  description?: string;
  primitives: Record<string, Primitive>;
  attributes?: Record<AttributeSlot, Attributes>;
}

export interface Primitive {
  name?: string;
  description?: string;
}

export interface Attribute {
  key: string;
  name?: string;
  description?: string;
}

export type Attributes = Attribute[];

export type AttributeSlot =
  | "bdl.module"
  | "bdl.enum"
  | "bdl.enum.item"
  | "bdl.import"
  | "bdl.oneof"
  | "bdl.oneof.item"
  | "bdl.proc"
  | "bdl.custom"
  | "bdl.struct"
  | "bdl.struct.field"
  | "bdl.union"
  | "bdl.union.item";
