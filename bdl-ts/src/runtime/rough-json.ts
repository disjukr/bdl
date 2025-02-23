export function parseRoughly(text: string): RoughJson {
  const ctx: Context = { text, pos: 0 };
  skipWs(ctx);
  return expectAny(ctx);
}

export type RoughJson =
  | RoughNull
  | RoughBoolean
  | RoughNumber
  | RoughString
  | RoughArray
  | RoughObject;

export interface RoughNull {
  type: "null";
}

export interface RoughBoolean {
  type: "boolean";
  value: boolean;
}

export interface RoughNumber {
  type: "number";
  text: string;
}

export interface RoughString {
  type: "string";
  text: string;
}

export interface RoughArray {
  type: "array";
  items: RoughJson[];
}

export interface RoughObject {
  type: "object";
  items: RouthJsonKeyValue[];
}

export interface RouthJsonKeyValue {
  key: RoughString;
  value: RoughJson;
}

export class InvalidJsonError extends Error {
  constructor() {
    super("Invalid JSON");
    this.name = "InvalidJsonError";
  }
}

interface Context {
  text: string;
  pos: number;
}

function skipWs(ctx: Context): void {
  while (ctx.pos < ctx.text.length) {
    const ch = ctx.text[ctx.pos];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      ++ctx.pos;
    } else {
      break;
    }
  }
}

function expectAny(ctx: Context): RoughJson {
  if (ctx.pos >= ctx.text.length) {
    throw new InvalidJsonError();
  }
  const ch = ctx.text[ctx.pos];
  if (ch === "n") {
    return expectNull(ctx);
  } else if (ch === "t" || ch === "f") {
    return expectBoolean(ctx);
  } else if (ch === "-" || (ch >= "0" && ch <= "9")) {
    return expectNumber(ctx);
  } else if (ch === '"') {
    return expectString(ctx);
  } else if (ch === "[") {
    return expectArray(ctx);
  } else if (ch === "{") {
    return expectObject(ctx);
  } else {
    throw new InvalidJsonError();
  }
}

function expectNull(ctx: Context): RoughNull {
  if (ctx.text.slice(ctx.pos, ctx.pos + 4) !== "null") {
    throw new InvalidJsonError();
  }
  ctx.pos += 4;
  return { type: "null" };
}

function expectBoolean(ctx: Context): RoughBoolean {
  if (ctx.text.slice(ctx.pos, ctx.pos + 4) === "true") {
    ctx.pos += 4;
    return { type: "boolean", value: true };
  } else if (ctx.text.slice(ctx.pos, ctx.pos + 5) === "false") {
    ctx.pos += 5;
    return { type: "boolean", value: false };
  } else {
    throw new InvalidJsonError();
  }
}

function expectNumber(ctx: Context): RoughNumber {
  let end = ctx.pos + 1;
  while (end < ctx.text.length) {
    const ch = ctx.text[end];
    if (ch === "." || (ch >= "0" && ch <= "9") || ch === "e" || ch === "E") {
      ++end;
    } else {
      break;
    }
  }
  const text = ctx.text.slice(ctx.pos, end);
  ctx.pos = end;
  return { type: "number", text };
}

function expectString(ctx: Context): RoughString {
  if (ctx.text[ctx.pos] !== '"') throw new InvalidJsonError();
  let end = ctx.pos + 1;
  while (end < ctx.text.length) {
    const ch = ctx.text[end];
    if (ch === "\\") ++end;
    ++end;
    if (ch === '"') break;
  }
  if (end >= ctx.text.length) throw new InvalidJsonError();
  const text = ctx.text.slice(ctx.pos, end);
  ctx.pos = end;
  return { type: "string", text };
}

function expectArray(ctx: Context): RoughArray {
  ctx.pos += 1;
  skipWs(ctx);
  const items: RoughJson[] = [];
  while (ctx.text[ctx.pos] !== "]") {
    items.push(expectAny(ctx));
    skipWs(ctx);
    if (ctx.text[ctx.pos] === ",") {
      ctx.pos += 1;
      skipWs(ctx);
    }
  }
  ctx.pos += 1;
  return { type: "array", items };
}

function expectObject(ctx: Context): RoughObject {
  ctx.pos += 1;
  skipWs(ctx);
  const items: RouthJsonKeyValue[] = [];
  while (ctx.text[ctx.pos] !== "}") {
    const key = expectString(ctx);
    skipWs(ctx);
    if (ctx.text[ctx.pos] !== ":") throw new InvalidJsonError();
    ctx.pos += 1;
    skipWs(ctx);
    const value = expectAny(ctx);
    items.push({ key, value });
    skipWs(ctx);
    if (ctx.text[ctx.pos] === ",") {
      ctx.pos += 1;
      skipWs(ctx);
    }
  }
  ctx.pos += 1;
  return { type: "object", items };
}
