import { assertEquals } from "@std/assert";
import type { BdlIr } from "../../generated/ir.ts";
import { generateOas } from "./oas-30-generator.ts";

Deno.test("generateOas reads conventional oas_* proc and field attributes", () => {
  const ir: BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: ["pkg.api.CreateUserInput", "pkg.api.CreateUser"],
        imports: [],
      },
    },
    defs: {
      "pkg.api.CreateUserInput": {
        type: "Struct",
        attributes: {},
        name: "CreateUserInput",
        fields: [{
          attributes: {
            description: "User email address",
            oas_format: "email",
          },
          name: "email",
          fieldType: {
            type: "Plain",
            valueTypePath: "string",
          },
          optional: false,
        }],
      },
      "pkg.api.CreateUser": {
        type: "Proc",
        attributes: {
          http: "POST /users",
          summary: "legacy summary",
          oas_summary: "Create user",
          oas_tags: "users, admin ",
          oas_security: "- bearerAuth: []",
        },
        name: "CreateUser",
        inputType: {
          type: "Plain",
          valueTypePath: "pkg.api.CreateUserInput",
        },
        outputType: {
          type: "Plain",
          valueTypePath: "void",
        },
      },
    },
  };

  const result = generateOas({ ir }).schema;
  const usersPath = result.paths?.["/users"];
  if (!usersPath || "$ref" in usersPath) {
    throw new Error("expected /users path item");
  }
  const operation = usersPath.post;
  const requestBody = operation?.requestBody;
  if (!requestBody || "$ref" in requestBody) {
    throw new Error("expected inline request body");
  }
  const emailSchema = result.components?.schemas?.CreateUserInput;

  assertEquals(operation?.summary, "Create user");
  assertEquals(operation?.tags, ["users", "admin"]);
  assertEquals(operation?.security, [{ bearerAuth: [] }]);
  assertEquals(
    requestBody.content?.["application/json"]?.schema,
    { $ref: "#/components/schemas/CreateUserInput" },
  );
  assertEquals(emailSchema, {
    type: "object",
    required: ["email"],
    properties: {
      email: {
        type: "string",
        description: "User email address",
        format: "email",
      },
    },
  });
});

Deno.test("generateOas keeps legacy summary fallback for existing schemas", () => {
  const ir: BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: ["pkg.api.Ping"],
        imports: [],
      },
    },
    defs: {
      "pkg.api.Ping": {
        type: "Proc",
        attributes: {
          http: "GET /ping",
          summary: "Ping",
        },
        name: "Ping",
        inputType: {
          type: "Plain",
          valueTypePath: "void",
        },
        outputType: {
          type: "Plain",
          valueTypePath: "void",
        },
      },
    },
  };

  const result = generateOas({ ir }).schema;
  const pingPath = result.paths?.["/ping"];
  if (!pingPath || "$ref" in pingPath) {
    throw new Error("expected /ping path item");
  }
  assertEquals(pingPath.get?.summary, "Ping");
});
