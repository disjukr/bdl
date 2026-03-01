import type * as ir from "../../generated/ir.ts";
import * as $d from "@disjukr/bdl-runtime/data-schema";

export function irToDefs(ir: ir.BdlIr): $d.Defs {
  const result: $d.Defs = $d.createPrimitiveDefs();
  for (const [defPath, def] of Object.entries(ir.defs)) {
    switch (def.type) {
      case "Custom":
        $d.defineCustom(
          defPath,
          irTypeToRuntimeType(def.originalType),
          {},
          result,
        );
        break;
      case "Enum":
        $d.defineEnum(
          defPath,
          new Set(def.items.map((item) => item.attributes.value || item.name)),
          result,
        );
        break;
      case "Oneof":
        $d.defineOneof(
          defPath,
          def.items.map((item) => irTypeToRuntimeType(item.itemType)),
          result,
        );
        break;
      case "Struct":
        $d.defineStruct(
          defPath,
          def.fields.map((field) => ({
            name: field.name,
            fieldType: irTypeToRuntimeType(field.fieldType),
            optional: field.optional,
          })),
          result,
        );
        break;
      case "Union":
        $d.defineUnion(
          defPath,
          def.attributes.discriminator || "type",
          Object.fromEntries(
            def.items.map((item) => [
              item.name,
              item.fields.map((field) => ({
                name: field.name,
                fieldType: irTypeToRuntimeType(field.fieldType),
                optional: field.optional,
              })),
            ]),
          ),
          result,
        );
        break;
      case "Proc":
        break;
    }
  }
  return result;
}

function irTypeToRuntimeType(type: ir.Type): $d.Type {
  switch (type.type) {
    case "Plain":
      return $d.p(type.valueTypePath);
    case "Array":
      return $d.a(type.valueTypePath);
    case "Dictionary":
      return $d.d(type.keyTypePath, type.valueTypePath);
  }
}
