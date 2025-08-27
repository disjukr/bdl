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
  | "Module"
  | "Enum"
  | "EnumItem"
  | "Import"
  | "Oneof"
  | "OneofItem"
  | "Proc"
  | "Custom"
  | "Struct"
  | "StructField"
  | "Union"
  | "UnionItem";
