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
          oas_summary: "Create user",
          oas_tags: "users, admin ",
          oas_security: "bearerAuth: []",
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

Deno.test("generateOas keeps field metadata when oas_format is applied to refs", () => {
  const ir: BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: ["pkg.api.Email", "pkg.api.User"],
        imports: [],
      },
    },
    defs: {
      "pkg.api.Email": {
        type: "Custom",
        attributes: {},
        name: "Email",
        originalType: {
          type: "Plain",
          valueTypePath: "string",
        },
      },
      "pkg.api.User": {
        type: "Struct",
        attributes: {},
        name: "User",
        fields: [{
          attributes: {
            description: "User email address",
            oas_format: "email",
          },
          name: "email",
          fieldType: {
            type: "Plain",
            valueTypePath: "pkg.api.Email",
          },
          optional: false,
        }],
      },
    },
  };

  const result = generateOas({ ir }).schema;
  const userSchema = result.components?.schemas?.User;

  assertEquals(userSchema, {
    type: "object",
    required: ["email"],
    properties: {
      email: {
        allOf: [{ $ref: "#/components/schemas/Email" }],
        description: "User email address",
        format: "email",
      },
    },
  });
});

Deno.test("generateOas emits responses from oneof oas_status metadata", () => {
  const ir: BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: [
          "pkg.api.OkResponse",
          "pkg.api.NotFoundResponse",
          "pkg.api.GetUserOutput",
          "pkg.api.GetUserError",
          "pkg.api.GetUser",
        ],
        imports: [],
      },
    },
    defs: {
      "pkg.api.OkResponse": {
        type: "Struct",
        attributes: {},
        name: "OkResponse",
        fields: [{
          attributes: {},
          name: "id",
          fieldType: {
            type: "Plain",
            valueTypePath: "string",
          },
          optional: false,
        }],
      },
      "pkg.api.NotFoundResponse": {
        type: "Struct",
        attributes: {},
        name: "NotFoundResponse",
        fields: [{
          attributes: {},
          name: "message",
          fieldType: {
            type: "Plain",
            valueTypePath: "string",
          },
          optional: false,
        }],
      },
      "pkg.api.GetUserOutput": {
        type: "Oneof",
        attributes: {},
        name: "GetUserOutput",
        items: [{
          attributes: {
            oas_status: "200",
            description: "User loaded",
          },
          itemType: {
            type: "Plain",
            valueTypePath: "pkg.api.OkResponse",
          },
        }],
      },
      "pkg.api.GetUserError": {
        type: "Oneof",
        attributes: {},
        name: "GetUserError",
        items: [{
          attributes: {
            oas_status: "404",
            description: "User not found",
          },
          itemType: {
            type: "Plain",
            valueTypePath: "pkg.api.NotFoundResponse",
          },
        }, {
          attributes: {
            oas_status: "default",
            description: "Unexpected failure",
            example: '{"message":"boom"}',
          },
          itemType: {
            type: "Plain",
            valueTypePath: "pkg.api.NotFoundResponse",
          },
        }],
      },
      "pkg.api.GetUser": {
        type: "Proc",
        attributes: {
          http: "GET /users/{id}",
          oas_summary: "Get user",
        },
        name: "GetUser",
        inputType: {
          type: "Plain",
          valueTypePath: "void",
        },
        outputType: {
          type: "Plain",
          valueTypePath: "pkg.api.GetUserOutput",
        },
        errorType: {
          type: "Plain",
          valueTypePath: "pkg.api.GetUserError",
        },
      },
    },
  };

  const result = generateOas({ ir }).schema;
  const userPath = result.paths?.["/users/{id}"];
  if (!userPath || "$ref" in userPath) {
    throw new Error("expected /users/{id} path item");
  }
  assertEquals(userPath.get?.responses, {
    "200": {
      description: "User loaded",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/OkResponse" },
        },
      },
    },
    "404": {
      description: "User not found",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/NotFoundResponse" },
        },
      },
    },
    default: {
      description: "Unexpected failure",
      content: {
        "application/json": {
          schema: { $ref: "#/components/schemas/NotFoundResponse" },
          example: { message: "boom" },
        },
      },
    },
  });
});

Deno.test("generateOas emits a default success response for plain outputs", () => {
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
          oas_summary: "Ping",
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
  assertEquals(pingPath.get?.responses, {
    "200": { description: "Successful response" },
  });
});

Deno.test("generateOas ignores legacy proc summary attributes", () => {
  const ir: BdlIr = {
    modules: {
      "pkg.api": {
        attributes: {},
        defPaths: ["pkg.api.LegacySummary"],
        imports: [],
      },
    },
    defs: {
      "pkg.api.LegacySummary": {
        type: "Proc",
        attributes: {
          http: "GET /legacy-summary",
          summary: "Legacy summary",
        },
        name: "LegacySummary",
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
  const legacyPath = result.paths?.["/legacy-summary"];
  if (!legacyPath || "$ref" in legacyPath) {
    throw new Error("expected /legacy-summary path item");
  }
  assertEquals(legacyPath.get?.summary, undefined);
});
