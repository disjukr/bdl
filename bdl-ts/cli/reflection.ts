import { parse as parseYml } from "jsr:@std/yaml@1";
import { Hono } from "jsr:@hono/hono@4";
import { buildIrWithConfigObject } from "../src/io/ir.ts";
import type { BdlConfig } from "../src/generated/config.ts";
import type { BdlStandard } from "../src/generated/standard.ts";
import conventionalStandard from "../src/conventional/standard.ts";

export function createReflectionServer(
  bdlConfig: BdlConfig,
  configDirectory: string,
): Hono {
  const app = new Hono();

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
    const standardYmlPath = standards[standardId];
    const standardYmlText = isUrl(standardYmlPath)
      ? await (await fetch(standardYmlPath)).text()
      : await Deno.readTextFile(standardYmlPath);
    const standardYml = parseYml(standardYmlText) as BdlStandard;
    return c.json(standardYml);
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
