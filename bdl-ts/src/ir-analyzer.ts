import type * as ir from "./generated/ir.ts";

export function listEveryImportedTypePaths(
  ir: ir.BdlIr,
  modulePath: string,
): Set<string> {
  const module = ir.modules[modulePath];
  const importedTypePaths = new Set<string>();
  for (const importedModule of module.imports) {
    for (const item of importedModule.items) {
      importedTypePaths.add(`${importedModule.modulePath}.${item.name}`);
    }
  }
  return importedTypePaths;
}

export function listEveryExternalTypePaths(
  ir: ir.BdlIr,
  modulePath: string,
): Set<string> {
  const referencedTypePaths = listEveryReferencedTypePaths(ir, modulePath);
  return new Set(
    referencedTypePaths.values().filter((typePath) => {
      if (!typePath.includes(".")) return false;
      return typePath.split(".").slice(0, -1).join(".") !== modulePath;
    }),
  );
}

export function listEveryReferencedTypePaths(
  ir: ir.BdlIr,
  modulePath: string,
): Set<string> {
  const module = ir.modules[modulePath];
  const referencedTypePaths = new Set<string>();
  function addType(type: ir.Type) {
    if (type.type === "Dictionary") referencedTypePaths.add(type.keyTypePath);
    referencedTypePaths.add(type.valueTypePath);
  }
  for (const defPath of module.defPaths) {
    const def = ir.defs[defPath];
    switch (def.type) {
      case "Custom":
        addType(def.originalType);
        break;
      case "Enum":
        break;
      case "Oneof":
        for (const item of def.items) addType(item.itemType);
        break;
      case "Proc":
        addType(def.inputType);
        addType(def.outputType);
        if (def.errorType) addType(def.errorType);
        break;
      case "Struct":
        for (const field of def.fields) addType(field.fieldType);
        break;
      case "Union":
        for (const item of def.items) {
          for (const field of item.fields) addType(field.fieldType);
        }
        break;
    }
  }
  return referencedTypePaths;
}

export function listEveryMissingExternalTypePaths(
  ir: ir.BdlIr,
  modulePath: string,
): Set<string> {
  const externalTypePaths = listEveryExternalTypePaths(ir, modulePath);
  const importedTypePaths = listEveryImportedTypePaths(ir, modulePath);
  return externalTypePaths.difference(importedTypePaths);
}
