import type * as ir from "./ir.ts";

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
  return `${
    attributesToString(statement.attributes)
  }import ${statement.modulePath} { ${
    statement.items.map((item) =>
      `${item.name}${item.as ? ` as ${item.as}` : ""}`
    ).join(", ")
  } }\n`;
}

function defToString(statement: ir.Def, typenames: Typenames): string {
  return `${
    attributesToString(statement.attributes)
  }${statement.body.type.toLowerCase()} ${statement.name} ${
    (() => {
      switch (statement.body.type) {
        case "Enum":
          return enumBodyToString(statement.body);
        case "Oneof":
          return oneofBodyToString(statement.body, typenames);
        case "Proc":
          return procToString(statement.body, typenames);
        case "Scalar":
          return scalarToString(statement.body, typenames);
        case "Socket":
          return socketToString(statement.body, typenames);
        case "Struct":
          return structBodyToString(statement.body, typenames);
        case "Union":
          return unionBodyToString(statement.body, typenames);
      }
    })()
  }\n`;
}

function enumBodyToString(body: ir.Enum): string {
  return bodyToString(body.items, ({ name }) => name);
}

function oneofBodyToString(body: ir.Oneof, typenames: Typenames): string {
  return bodyToString(body.items, ({ type }) => typeToString(type, typenames));
}

function procToString(body: ir.Proc, typenames: Typenames): string {
  const { inputType, outputType, errorType } = body;
  return `= ${typeToString(inputType, typenames)} -> ${
    typeToString(outputType, typenames)
  }${errorType ? ` throws ${typeToString(errorType, typenames)}` : ""}`;
}

function scalarToString(body: ir.Scalar, typenames: Typenames): string {
  return `= ${typeToString(body.scalarType, typenames)}`;
}

function socketToString(body: ir.Socket, typenames: Typenames): string {
  return `= ${typeToString(body.serverMessageType, typenames)} <-> ${
    typeToString(body.clientMessageType, typenames)
  }`;
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
          })`
          : ""
      },\n`,
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
    typeToString(structField.itemType, typenames)
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
