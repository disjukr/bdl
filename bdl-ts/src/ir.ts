export interface BdlIr {
  modules: Record<string, Module>;
  defs: Record<string, Def>;
}

export interface Attribute {
  id: string;
  content: string;
}

export interface Module {
  fileUrl?: string;
  attributes: Attribute[];
  defPaths: string[];
  imports: Import[];
}

export interface Import {
  attributes: Attribute[];
  modulePath: string;
  items: ImportItem[];
}

export interface ImportItem {
  name: string;
  as?: string;
}

export interface Def {
  attributes: Attribute[];
  name: string;
  body: DefBody;
}

export type DefBody = Enum | Rpc | Scalar | Socket | Struct | Union;
export interface Enum {
  type: "Enum";
  items: EnumItem[];
}
export interface Rpc {
  type: "Rpc";
  items: RpcItem[];
}
export interface Scalar {
  type: "Scalar";
  scalarType: Type;
}
export interface Socket {
  type: "Socket";
  serverToClient?: SocketItem;
  clientToServer?: SocketItem;
}
export interface Struct {
  type: "Struct";
  fields: StructField[];
}
export interface Union {
  type: "Union";
  discriminatorKey?: string;
  items: UnionItem[];
}

export interface EnumItem {
  attributes: Attribute[];
  name: string;
  value: string;
}

export interface RpcItem {
  attributes: Attribute[];
  name: string;
  stream: boolean;
  inputFields: StructField[];
  outputType: Type;
  errorType?: Type;
}

export interface SocketItem {
  attributes: Attribute[];
  messageType: Type;
}

export interface StructField {
  attributes: Attribute[];
  name: string;
  itemType: Type;
  optional: boolean;
}

export type StructFieldNullPolicy = UseDefaultValue | Throw | Allow;
export interface UseDefaultValue {
  type: "UseDefaultValue";
}
export interface Throw {
  type: "Throw";
}
export interface Allow {
  type: "Allow";
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
  attributes: Attribute[];
  name: string;
  jsonKey?: string;
  fields: StructField[];
}
