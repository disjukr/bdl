import { parse as parseYaml } from "@std/yaml";
import { Hono } from "@hono/hono";
import { buildIrWithConfigObject } from "../src/io/ir.ts";
import type { BdlConfig } from "../src/generated/config.ts";
import type { BdlStandard } from "../src/generated/standard.ts";
import builtinStandards from "../src/builtin/standards.ts";
import {
  gatherEntryModulePaths,
  getResolveModuleFileFn,
} from "../src/io/config.ts";

export function createReflectionServer(
  bdlConfig: BdlConfig,
  configDirectory: string,
): Hono {
  const app = new Hono();

  app.get("/bdl/modules", async (c) => {
    const entryModulePaths = await gatherEntryModulePaths(
      configDirectory,
      bdlConfig.paths,
    );
    return c.json(entryModulePaths);
  });

  app.get("/bdl/modules/:modulePath/text", async (c) => {
    const modulePath = c.req.param("modulePath");
    const resolveModuleFile = getResolveModuleFileFn(
      bdlConfig,
      configDirectory,
    );
    try {
      const moduleFile = await resolveModuleFile(modulePath);
      return c.json(moduleFile.text);
    } catch {
      return c.json({ type: "NotFound" }, 404);
    }
  });

  app.get("/bdl/standards", (c) => {
    return c.json(Array.from(listStandards(bdlConfig)));
  });

  app.get("/bdl/standards/:standardId", async (c) => {
    const standardId = c.req.param("standardId");
    const standards = bdlConfig.standards || {};
    if (standardId in builtinStandards && !(standardId in standards)) {
      return c.json(builtinStandards[standardId]);
    }
    if (!(standardId in standards)) return c.json({ type: "NotFound" }, 404);
    const standardPath = standards[standardId];
    const standardText = isUrl(standardPath)
      ? await (await fetch(standardPath)).text()
      : await Deno.readTextFile(standardPath);
    return c.json(parseYaml(standardText) as BdlStandard);
  });

  app.get("/bdl/standards/:standardId/ir", async (c) => {
    const standard = c.req.param("standardId");
    const standards = listStandards(bdlConfig);
    if (!standards.has(standard)) return c.json({ type: "NotFound" }, 404);
    const { ir } = await buildIrWithConfigObject({
      bdlConfig,
      configDirectory,
      standard,
      omitFileUrl: true,
    });
    return c.json(ir);
  });

  return app;
}

function listStandards(config: BdlConfig): Set<string> {
  const standards = new Set(Object.keys(builtinStandards));
  for (const key of Object.keys(config.standards || {})) standards.add(key);
  return standards;
}

function isUrl(path: string) {
  try {
    new URL(path);
    return true;
  } catch {
    return false;
  }
}
