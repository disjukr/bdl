export type BdlIrRef = Module | Def;

export interface Module {
  type: "Module";
  path: string;
  ref: ModuleRef;
}

export interface Def {
  type: "Def";
  path: string;
  ref: DefRef;
}

export type AttributeRef = This | Key | Value;

export interface This {
  type: "This";
}

export interface Key {
  type: "Key";
}

export interface Value {
  type: "Value";
}

export type ModuleRef = This | FileUrl | Attribute | DefPath | Import;

export interface FileUrl {
  type: "FileUrl";
}

export interface Attribute {
  type: "Attribute";
  key: string;
  ref: AttributeRef;
}

export interface DefPath {
  type: "DefPath";
  index: number;
}

export interface Import {
  type: "Import";
  index: number;
  ref: ImportRef;
}

export type ImportRef = This | Attribute | ModulePath | Item;

export interface ModulePath {
  type: "ModulePath";
}

export interface Item {
  type: "Item";
  index: number;
  ref: ImportItemRef;
}

export type ImportItemRef = This | Name | As;

export interface Name {
  type: "Name";
}

export interface As {
  type: "As";
}

export type DefRef = This | Attribute | Name | Body;

export interface Body {
  type: "Body";
  ref: DefBodyRef;
}

export type DefBodyRef =
  | This
  | Enum
  | Oneof
  | Proc
  | Scalar
  | Socket
  | Struct
  | Union;

export interface Enum {
  type: "Enum";
  index: number;
  ref: EnumItemRef;
}

export interface Oneof {
  type: "Oneof";
  index: number;
  ref: OneofItemRef;
}

export interface Proc {
  type: "Proc";
  ref: ProcRef;
}

export interface Scalar {
  type: "Scalar";
  typeRef: TypeRef;
}

export interface Socket {
  type: "Socket";
  ref: SocketRef;
}

export interface Struct {
  type: "Struct";
  index: number;
  ref: StructFieldRef;
}

export interface Union {
  type: "Union";
  index: number;
  ref: UnionItemRef;
}

export type EnumItemRef = Attribute | Name;

export type OneofItemRef = Attribute | Type;

export interface Type {
  type: "Type";
  ref: TypeRef;
}

export type ProcRef = InputType | OutputType | ErrorType;

export interface InputType {
  type: "InputType";
  ref: TypeRef;
}

export interface OutputType {
  type: "OutputType";
  ref: TypeRef;
}

export interface ErrorType {
  type: "ErrorType";
  ref: TypeRef;
}

export type SocketRef = ServerMessageType | ClientMessageType;

export interface ServerMessageType {
  type: "ServerMessageType";
  ref: TypeRef;
}

export interface ClientMessageType {
  type: "ClientMessageType";
  ref: TypeRef;
}

export type StructFieldRef = This | Attribute | Name | ItemType | Optional;

export interface ItemType {
  type: "ItemType";
  ref: TypeRef;
}

export interface Optional {
  type: "Optional";
}

export type TypeRef = This | ValueTypePath | KeyTypePath;

export interface ValueTypePath {
  type: "ValueTypePath";
}

export interface KeyTypePath {
  type: "KeyTypePath";
}

export type UnionItemRef = This | Attribute | Name | Fields;

export interface Fields {
  type: "Fields";
  index: number;
  ref: StructFieldRef;
}
