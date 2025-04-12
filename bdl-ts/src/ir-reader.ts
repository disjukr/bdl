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
  const module = ir.modules[modulePath];
  const referencedTypePaths = listEveryReferencedTypePaths(ir, modulePath);
  return referencedTypePaths.difference(new Set(module.defPaths));
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
    switch (def.body.type) {
      case "Custom":
        addType(def.body.originalType);
        break;
      case "Enum":
        break;
      case "Oneof":
        for (const item of def.body.items) addType(item.itemType);
        break;
      case "Proc":
        addType(def.body.inputType);
        addType(def.body.outputType);
        if (def.body.errorType) addType(def.body.errorType);
        break;
      case "Struct":
        for (const field of def.body.fields) addType(field.fieldType);
        break;
      case "Union":
        for (const item of def.body.items) {
          for (const field of item.fields) addType(field.fieldType);
        }
        break;
    }
  }
  return referencedTypePaths;
}

export function listEveryMissingTypePaths(
  ir: ir.BdlIr,
  modulePath: string,
): Set<string> {
  const externalTypePaths = listEveryExternalTypePaths(ir, modulePath);
  const importedTypePaths = listEveryImportedTypePaths(ir, modulePath);
  return externalTypePaths.difference(importedTypePaths);
}
