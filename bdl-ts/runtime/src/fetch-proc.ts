import {
  defs,
  type Schema,
  type StructField,
  type Type,
} from "./data-schema.ts";
import { parseRoughly } from "./misc/rough-json.ts";
import {
  desType as desJsonType,
  ser as serJson,
  serFields,
} from "./json-ser-des.ts";
import { ser as serString, serType as serTypeString } from "./text-ser-des.ts";

export type FetchFn = (typeof globalThis)["fetch"];
export type FetchConfig = Parameters<FetchFn>[1];

export const globalFetchProcConfig: FetchProcConfig = {};

export interface FetchProcConfig {
  readonly fetch?: FetchFn;
  readonly baseUrl?: string | URL;
}

export interface FetchProcEndpoint<Req, Res> {
  readonly method: string;
  readonly pathname: string[]; // ["/foo/", "/bar/", ...]
  /**
   * The field names of the req object
   * and is calculated and inserted between pathnames.
   */
  readonly pathParams: string[];
  /**
   * The field names of the req object
   * and is calculated and inserted into the query string.
   */
  readonly searchParams: string[];
  readonly reqType: Type;
  readonly resTypes: Record</* status code */ number, Type>;
}

export interface FetchProcResponse<Res> {
  res: Response;
  data: Res;
}

export type FetchProc<Req, Res> = (
  req: Req,
  fetchConfig: FetchConfig,
) => Promise<FetchProcResponse<Res>>;

export function defineFetchProc<Req, Res>(
  endpoint: FetchProcEndpoint<Req, Res>,
  config: FetchProcConfig = {},
): FetchProc<Req, Res> {
  const { method } = endpoint;
  return async (req, fetchConfig) => {
    const fetchProcConfig = { ...globalFetchProcConfig, ...config };
    const { fetch = globalThis.fetch, baseUrl } = fetchProcConfig;
    const url = getReqUrl(req, endpoint, baseUrl);
    const body = serReqBody(endpoint, req);
    const res = await fetch(url, { ...fetchConfig, method, body });
    const json = await res.text();
    const resType = endpoint.resTypes[res.status];
    if (!resType) {
      throw new FetchProcError(`unexpected status code: ${res.status}`);
    }
    const data = desJsonType<Res>(resType, parseRoughly(json));
    if (is4xx(res.status)) throw new FetchProc4xxError({ res, data });
    if (is5xx(res.status)) throw new FetchProc5xxError({ res, data });
    return { res, data };
  };
}

export class FetchProcError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "FetchProcError";
  }
}

export class FetchProc4xxError extends FetchProcError
  implements FetchProcResponse<unknown> {
  readonly res: Response;
  readonly data: unknown;
  constructor({ res, data }: FetchProcResponse<unknown>) {
    super(res.statusText);
    this.name = "FetchProc4xxError";
    this.res = res;
    this.data = data;
  }
}

export class FetchProc5xxError extends FetchProcError
  implements FetchProcResponse<unknown> {
  readonly res: Response;
  readonly data: unknown;
  constructor({ res, data }: FetchProcResponse<unknown>) {
    super(res.statusText);
    this.name = "FetchProc5xxError";
    this.res = res;
    this.data = data;
  }
}

function is4xx(statusCode: number): boolean {
  return statusCode >= 400 && statusCode < 500;
}

function is5xx(statusCode: number): boolean {
  return statusCode >= 500 && statusCode < 600;
}

function getReqUrl<Req, Res>(
  req: Req,
  endpoint: FetchProcEndpoint<Req, Res>,
  baseUrl?: string | URL,
): URL {
  const reqSchema = defs[endpoint.reqType.valueId];
  const fieldsSchema = fieldsSchemaToRecord(
    getFieldsSchema(reqSchema, req),
  );
  const pathArgs = endpoint.pathParams.map((param) => {
    const fieldSchema = fieldsSchema[param];
    if (!fieldSchema) throw new Error(`unknown path param: ${param}`);
    const fieldValue = (req as Record<string, unknown>)[param];
    if (fieldValue == null) {
      throw new Error(`path param must not be null: ${param}`);
    }
    return encodeURIComponent(serTypeString(fieldSchema.fieldType, fieldValue));
  });
  const pathname = interleave(endpoint.pathname, pathArgs).join("");
  const url = new URL(pathname, baseUrl);
  for (const param of endpoint.searchParams) {
    const fieldSchema = fieldsSchema[param];
    if (!fieldSchema) throw new Error(`unknown search param: ${param}`);
    const fieldValue = (req as Record<string, unknown>)[param];
    switch (fieldSchema.fieldType.type) {
      default:
        url.searchParams.set(
          param,
          serTypeString(fieldSchema.fieldType, fieldValue),
        );
        break;
      case "Array": {
        for (const item of fieldValue as unknown[]) {
          const valueSchema = defs[fieldSchema.fieldType.valueId];
          url.searchParams.append(param, serString(valueSchema, item));
        }
        break;
      }
    }
  }
  return url;
}

function serReqBody<Req, Res>(
  endpoint: FetchProcEndpoint<Req, Res>,
  req: Req,
): string {
  const reqSchema = defs[endpoint.reqType.valueId];
  switch (reqSchema.type) {
    default:
      return serJson(reqSchema, req);
    case "Struct":
    case "Union": {
      const fields = removePathAndSearchParams(
        endpoint,
        getFieldsSchema(reqSchema, req),
      );
      return `{${serFields(fields, req)}}`;
    }
  }
}

function removePathAndSearchParams<Req, Res>(
  endpoint: FetchProcEndpoint<Req, Res>,
  fields: StructField[],
): StructField[] {
  const record = fieldsSchemaToRecord(fields);
  for (const param of endpoint.pathParams) delete record[param];
  for (const param of endpoint.searchParams) delete record[param];
  return Object.values(record);
}

function getFieldsSchema<T>(schema: Schema<T>, data: T): StructField[] {
  switch (schema.type) {
    default:
      return [];
    case "Struct":
      return schema.fields;
    case "Union": {
      const type = (data as Record<string, unknown>).type as string;
      return schema.items[type];
    }
  }
}

function fieldsSchemaToRecord(
  fields: StructField[],
): Record<string, StructField> {
  const record: Record<string, StructField> = {};
  for (const field of fields) record[field.name] = field;
  return record;
}

/**
 * @example
 *   interleave(["/foo/", "/baz/"], ["bar", "qux"])
 *   // => ["/foo/", "bar", "/baz/", "qux"]
 */
function interleave(arr1: string[], arr2: string[]): string[] {
  const result = [];
  for (let i = 0; i < arr1.length; i++) {
    result.push(arr1[i]);
    if (i < arr2.length) result.push(arr2[i]);
  }
  return result;
}
