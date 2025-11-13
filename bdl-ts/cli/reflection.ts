import { parse as parseYml } from "jsr:@std/yaml@1";
import { Hono } from "jsr:@hono/hono@4";
import { buildIrWithConfigObject } from "../src/io/ir.ts";
import type { BdlConfig } from "../src/generated/config.ts";
import type { BdlStandard } from "../src/generated/standard.ts";
import conventionalStandard from "../src/conventional/standard.ts";
import {
  gatherEntryModulePaths,
  getResolveModuleFileFn,
} from "../src/io/config.ts";
import { fromBonText } from "../src/io/standard.ts";

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
    if ((standardId === "conventional") && !("conventional" in standards)) {
      return c.json(conventionalStandard);
    }
    if (!(standardId in standards)) return c.json({ type: "NotFound" }, 404);
    const standardPath = standards[standardId];
    const standardText = isUrl(standardPath)
      ? await (await fetch(standardPath)).text()
      : await Deno.readTextFile(standardPath);
    if (standardPath.endsWith(".yml")) {
      return c.json(parseYml(standardText) as BdlStandard);
    } else {
      return c.json(fromBonText(standardText));
    }
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
  const standards = new Set(["conventional"]);
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
