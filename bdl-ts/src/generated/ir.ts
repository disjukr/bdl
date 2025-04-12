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

export type Def = Custom | Enum | Oneof | Proc | Struct | Union;

export interface Custom {
  type: "Custom";
  attributes: Record<string, string>;
  name: string;
  originalType: Type;
}

export interface Enum {
  type: "Enum";
  attributes: Record<string, string>;
  name: string;
  items: EnumItem[];
}

export interface Oneof {
  type: "Oneof";
  attributes: Record<string, string>;
  name: string;
  items: OneofItem[];
}

export interface Proc {
  type: "Proc";
  attributes: Record<string, string>;
  name: string;
  inputType: Type;
  outputType: Type;
  errorType?: Type;
}

export interface Struct {
  type: "Struct";
  attributes: Record<string, string>;
  name: string;
  fields: StructField[];
}

export interface Union {
  type: "Union";
  attributes: Record<string, string>;
  name: string;
  items: UnionItem[];
}

export interface EnumItem {
  attributes: Record<string, string>;
  name: string;
}

export interface OneofItem {
  attributes: Record<string, string>;
  itemType: Type;
}

export interface StructField {
  attributes: Record<string, string>;
  name: string;
  fieldType: Type;
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
