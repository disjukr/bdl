import { parse as parseYml } from "jsr:@std/yaml";

const browserSdkYml = await Deno.readTextFile(
  new URL("../tmp/browser-sdk.yml", import.meta.url),
);
const browserSdk = parseYml(browserSdkYml) as BrowserSdk;
console.log({ browserSdk }); // TODO

interface BrowserSdk {
  resources: {
    entity: Record<string, TypeDef>;
  };
}

type TypeDef =
  | ObjectTypeDef
  | EnumTypeDef
  | OneOfTypeDef
  | UnionTypeDef
  | ResourceRefTypeDef;

interface TypeDefBase {
  type: string;
  description?: string;
}

interface ObjectTypeDef extends TypeDefBase {
  type: "object";
  properties: Record<string, FieldDef>;
}

interface EnumTypeDef extends TypeDefBase {
  type: "enum";
  variants: Record<string, { description: string }>;
  valuePrefix?: string;
}

interface OneOfTypeDef extends TypeDefBase {
  type: "oneOf";
  properties: Record<string, FieldDef>;
}

interface UnionTypeDef extends TypeDefBase {
  type: "union";
  types: TypeDef[];
}

interface ResourceRefTypeDef extends TypeDefBase {
  type: "resourceRef";
  $ref: string;
}

type FieldDef =
  | FieldDefBase
  | ArrayFieldDef
  | UnionFieldDef
  | ResourceRefFieldDef;

interface FieldDefBase {
  type: string;
  description?: string;
  optional?: boolean;
}

interface ArrayFieldDef extends FieldDefBase {
  type: "array";
  items: FieldDef;
}

interface UnionFieldDef extends FieldDefBase {
  type: "union";
  items: FieldDef[];
}

interface ResourceRefFieldDef extends FieldDefBase {
  type: "resourceRef";
  $ref: string;
}
