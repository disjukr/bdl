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
    ...module.defPaths.map((defPath) =>
      defToString(ir.defs[defPath], typenames)
    ),
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
      return `${attributesToString(item.attributes, false, 1)}${item.name} = ${
        JSON.stringify(item.value)
      }\n`;
    }).join("")
  }}`;
}

function rpcBodyToString(body: ir.Rpc, typenames: Typenames): string {
  if (body.items.length < 1) return "{}";
  return `{\n${
    body.items.map((item) => {
      return `${attributesToString(item.attributes, false, 1)}  ${
        item.stream ? "stream " : ""
      }${item.name}(${
        item.inputFields.length
          ? `\n${
            item.inputFields.map((field) =>
              structFieldToString(field, typenames, 2)
            ).join("")
          }`
          : ""
      }): ${typeToString(item.outputType, typenames)}${
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
  const discriminatorKey = body.discriminatorKey
    ? `${JSON.stringify(body.discriminatorKey)} `
    : "";
  if (body.items.length < 1) return `${discriminatorKey}{}`;
  return `${discriminatorKey}{\n${
    body.items.map((item) =>
      `${attributesToString(item.attributes, false, 1)}${item.name}${
        item.jsonKey ? JSON.stringify(item.jsonKey) : ""
      }${
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
  const { name, nullPolicy } = structField;
  const indentText = indent(depth);
  const attributes = structField.attributes.map((attribute) =>
    attributeToString(attribute, false, depth)
  ).join("");
  return `${attributes}${indentText}${name}${
    nullPolicy.type === "Allow" ? "?" : nullPolicy.type === "Throw" ? "!" : ""
  }: ${typeToString(structField.itemType, typenames)},\n`;
}

function typeToString(type: ir.Type, typenames: Typenames): string {
  switch (type.type) {
    default:
    case "Plain":
      return typenames[type.valueTypePath];
    case "Array":
      return `${typenames[type.valueTypePath]}[]`;
    case "Dictionary":
      return `${typenames[type.valueTypePath]}[${typenames[type.keyTypePath]}]`;
  }
}

function attributesToString(
  attributes: ir.Attribute[],
  inner = false,
  depth = 0,
): string {
  return attributes.map((attribute) =>
    attributeToString(attribute, inner, depth)
  ).join("");
}

function attributeToString(
  attribute: ir.Attribute,
  inner = false,
  depth = 0,
): string {
  const indentText = indent(depth);
  const content = attribute.content.split("\n").map((line) =>
    `${indentText}|${line && ` ${line}`}\n`
  );
  return `${indentText}${inner ? "#" : "@"} ${attribute.id}${
    content && `\n${content}`
  }`;
}

function indent(depth: number, text = "  ") {
  return Array(depth).fill(text).join("");
}
