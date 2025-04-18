import type * as ir from "./generated/ir.ts";

export function moduleToString(ir: ir.BdlIr, modulePath: string): string {
  const module = ir.modules[modulePath];
  const typenames: Typenames = Object.fromEntries(
    [
      ...module.imports.flatMap((statement) =>
        statement.items.map(
          (
            item,
          ) =>
            [
              `${statement.modulePath}.${item.name}`,
              item.as || item.name,
            ] as const,
        )
      ),
      ...module.defPaths.map((path) =>
        [path, path.split(".").at(-1)!] as const
      ),
    ],
  );
  return [
    attributesToString(module.attributes, true),
    module.imports.map((statement) => importToString(statement)).join(""),
    ...module.defPaths
      .filter((defPath) => defPath in ir.defs)
      .map((defPath) => defToString(ir.defs[defPath], typenames)),
  ].filter(Boolean).join("\n");
}

function importToString(statement: ir.Import): string {
  const attributes = attributesToString(statement.attributes);
  const items = statement.items.map(
    (item) => `${item.name}${item.as ? ` as ${item.as}` : ""}`,
  ).sort();
  const oneliner = `import ${statement.modulePath} { ${items.join(", ")} }`;
  if (oneliner.length <= 80) return `${attributes}${oneliner}\n`;
  return `${attributes}import ${statement.modulePath} {\n${
    items.map((item) => `  ${item},\n`).join("")
  }}\n`;
}

function defToString(statement: ir.Def, typenames: Typenames): string {
  const attributes = attributesToString(statement.attributes);
  const defHead = `${statement.type.toLowerCase()} ${statement.name} `;
  return `${attributes}${defHead}${
    (() => {
      switch (statement.type) {
        case "Custom":
          return customToString(statement, typenames);
        case "Enum":
          return enumBodyToString(statement);
        case "Oneof":
          return oneofBodyToString(statement, typenames);
        case "Proc":
          return procToString(statement, typenames, defHead.length);
        case "Struct":
          return structBodyToString(statement, typenames);
        case "Union":
          return unionBodyToString(statement, typenames);
      }
    })()
  }\n`;
}

function customToString(body: ir.Custom, typenames: Typenames): string {
  return `= ${typeToString(body.originalType, typenames)}`;
}

function enumBodyToString(body: ir.Enum): string {
  return bodyToString(body.items, ({ name }) => name);
}

function oneofBodyToString(body: ir.Oneof, typenames: Typenames): string {
  return bodyToString(
    body.items,
    ({ itemType }) => typeToString(itemType, typenames),
  );
}

function procToString(
  body: ir.Proc,
  typenames: Typenames,
  headLength: number,
): string {
  const inputType = typeToString(body.inputType, typenames);
  const outputType = typeToString(body.outputType, typenames);
  const errorType = body.errorType && typeToString(body.errorType, typenames);
  if (errorType) {
    const oneliner = `= ${inputType} -> ${outputType} throws ${errorType}`;
    if ((headLength + oneliner.length) <= 80) return oneliner;
    else return `=\n  ${inputType} ->\n  ${outputType} throws ${errorType}`;
  } else {
    const oneliner = `= ${inputType} -> ${outputType}`;
    if ((headLength + oneliner.length) <= 80) return oneliner;
    else return `=\n  ${inputType} -> ${outputType}`;
  }
}

function structBodyToString(body: ir.Struct, typenames: Typenames): string {
  return bodyToString(
    body.fields,
    (field) => structFieldToString(field, typenames),
  );
}

function unionBodyToString(body: ir.Union, typenames: Typenames): string {
  return bodyToString(
    body.items,
    ({ name, fields }) =>
      `${name}${
        fields.length
          ? `(\n${
            bodyItemsToString(
              fields,
              (field) => structFieldToString(field, typenames),
              2,
            )
          }  )`
          : ""
      }`,
  );
}

interface BodyItem {
  attributes: Record<string, string>;
}
function bodyToString<T extends BodyItem>(
  items: T[],
  itemToString: (item: T, index: number) => string,
  depth = 1,
): string {
  if (items.length < 1) return "{}";
  return `{\n${bodyItemsToString(items, itemToString, depth)}}`;
}
function bodyItemsToString<T extends BodyItem>(
  items: T[],
  itemToString: (item: T, index: number) => string,
  depth = 1,
): string {
  const indentText = indent(depth);
  return items.map((item, index) => {
    const attributes = attributesToString(item.attributes, false, depth);
    const hasAttributes = Boolean(attributes);
    const text = `${attributes}${indentText}${itemToString(item, index)},\n`;
    return { hasAttributes, text };
  }).map(({ text, hasAttributes }, index, items) => {
    const next = items[index + 1];
    if (!next) return text;
    const addNewline = Boolean(hasAttributes || next?.hasAttributes);
    if (addNewline) return `${text}\n`;
    return text;
  }).join("");
}

type Typenames = Record<string, string>;

function structFieldToString(
  structField: ir.StructField,
  typenames: Typenames,
): string {
  const { name, optional } = structField;
  return `${name}${optional ? "?" : ""}: ${
    typeToString(structField.fieldType, typenames)
  }`;
}

function typeToString(type: ir.Type, typenames: Typenames): string {
  switch (type.type) {
    default:
    case "Plain":
      return getTypename(type.valueTypePath, typenames);
    case "Array":
      return `${getTypename(type.valueTypePath, typenames)}[]`;
    case "Dictionary":
      return `${getTypename(type.valueTypePath, typenames)}[${
        getTypename(type.keyTypePath, typenames)
      }]`;
  }
}

function getTypename(typePath: string, typenames: Typenames): string {
  if (typePath in typenames) return typenames[typePath];
  return typePath;
}

function attributesToString(
  attributes: Record<string, string>,
  inner = false,
  depth = 0,
): string {
  const result: string[] = [];
  const indentText = indent(depth);
  for (const [attributeId, attributeContent] of Object.entries(attributes)) {
    const content = (() => {
      const lines = attributeContent.split("\n");
      if (lines.length > 1) {
        return lines
          .map((line) => `\n${indentText}|${line && ` ${line}`}`)
          .join("");
      }
      if (lines[0]) return ` - ${lines[0]}`;
      return "";
    })();
    result.push(`${indentText}${inner ? "#" : "@"} ${attributeId}${content}\n`);
  }
  return result.join("");
}

function indent(depth: number, text = "  ") {
  return Array(depth).fill(text).join("");
}
