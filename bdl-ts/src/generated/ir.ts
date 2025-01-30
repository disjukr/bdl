export interface BdlIr {
  modules: Record<string, Module>;
  defs: Record<string, Def>;
}

export interface Module {
  fileUrl?: string;
  attributes: Record<string, string>;
  defPaths: string[];
  imports: Import[];
}

export interface Import {
  attributes: Record<string, string>;
  modulePath: string;
  items: ImportItem[];
}

export interface ImportItem {
  name: string;
  as?: string;
}

export interface Def {
  attributes: Record<string, string>;
  name: string;
  body: DefBody;
}

export type DefBody = Enum | Oneof | Proc | Scalar | Socket | Struct | Union;

export interface Enum {
  type: "Enum";
  items: EnumItem[];
}

export interface Oneof {
  type: "Oneof";
  items: OneofItem[];
}

export interface Proc {
  type: "Proc";
  inputType: Type;
  outputType: Type;
  errorType?: Type;
}

export interface Scalar {
  type: "Scalar";
  scalarType: Type;
}

export interface Socket {
  type: "Socket";
  serverMessageType: Type;
  clientMessageType: Type;
}

export interface Struct {
  type: "Struct";
  fields: StructField[];
}

export interface Union {
  type: "Union";
  items: UnionItem[];
}

export interface EnumItem {
  attributes: Record<string, string>;
  name: string;
}

export interface OneofItem {
  attributes: Record<string, string>;
  type: Type;
}

export interface StructField {
  attributes: Record<string, string>;
  name: string;
  itemType: Type;
  optional: boolean;
}

export type Type = Plain | Array | Dictionary;

export interface Plain {
  type: "Plain";
  valueTypePath: string;
}

export interface Array {
  type: "Array";
  valueTypePath: string;
}

export interface Dictionary {
  type: "Dictionary";
  valueTypePath: string;
  keyTypePath: string;
}

export interface UnionItem {
  attributes: Record<string, string>;
  name: string;
  fields: StructField[];
}
