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
        case "Rpc":
          return rpcBodyToString(statement.body, typenames);
        case "Scalar":
          return scalarToString(statement.body, typenames);
        case "Socket":
          return socketBodyToString(statement.body, typenames);
        case "Struct":
          return structBodyToString(statement.body, typenames);
        case "Union":
          return unionBodyToString(statement.body, typenames);
      }
    })()
  }\n`;
}

function enumBodyToString(body: ir.Enum): string {
  if (body.items.length < 1) return "{}";
  return `{\n${
    body.items.map((item) => {
      return `${attributesToString(item.attributes, false, 1)}${item.name},\n`;
    }).join("")
  }}`;
}

function rpcBodyToString(body: ir.Rpc, typenames: Typenames): string {
  if (body.items.length < 1) return "{}";
  return `{\n${
    body.items.map((item) => {
      return `${attributesToString(item.attributes, false, 1)}  ${item.name}: ${
        typeToString(item.inputType, typenames)
      } -> ${typeToString(item.outputType, typenames)}${
        item.errorType
          ? ` throws ${typeToString(item.errorType, typenames)}`
          : ""
      },\n`;
    }).join("")
  }}`;
}

function scalarToString(body: ir.Scalar, typenames: Typenames): string {
  return `= ${typeToString(body.scalarType, typenames)}`;
}

function socketBodyToString(body: ir.Socket, typenames: Typenames): string {
  if (!body.serverToClient && !body.clientToServer) return "{}";
  return `{\n${
    body.serverToClient
      ? `${
        attributesToString(body.serverToClient.attributes)
      }  server -> client: ${
        typeToString(body.serverToClient.messageType, typenames)
      },\n`
      : ""
  }${
    body.clientToServer
      ? `${
        attributesToString(body.clientToServer.attributes)
      }  client -> server: ${
        typeToString(body.clientToServer.messageType, typenames)
      },\n`
      : ""
  }}`;
}

function structBodyToString(body: ir.Struct, typenames: Typenames): string {
  if (body.fields.length < 1) return "{}";
  return `{\n${
    body.fields.map((field) => structFieldToString(field, typenames, 1)).join(
      "",
    )
  }}`;
}

function unionBodyToString(body: ir.Union, typenames: Typenames): string {
  if (body.items.length < 1) return "{}";
  return `{\n${
    body.items.map((item) =>
      `${attributesToString(item.attributes, false, 1)}${item.name}${
        item.fields.length
          ? `(\n${
            item.fields.map((field) => structFieldToString(field, typenames, 2))
          })`
          : ""
      },\n`
    ).join("")
  }}`;
}

type Typenames = Record<string, string>;

function structFieldToString(
  structField: ir.StructField,
  typenames: Typenames,
  depth = 1,
): string {
  const { name, optional } = structField;
  const indentText = indent(depth);
  const attributes = attributesToString(structField.attributes, false, depth);
  return `${attributes}${indentText}${name}${optional ? "?" : ""}: ${
    typeToString(structField.itemType, typenames)
  },\n`;
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
      if (lines.length < 1) return "";
      if (lines.length === 1) return ` - ${lines[0]}`;
      return lines
        .map((line) => `\n${indentText}|${line && ` ${line}`}`)
        .join("");
    })();
    result.push(`${indentText}${inner ? "#" : "@"} ${attributeId}${content}\n`);
  }
  return result.join("");
}

function indent(depth: number, text = "  ") {
  return Array(depth).fill(text).join("");
}
